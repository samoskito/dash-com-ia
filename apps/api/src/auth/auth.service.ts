import { randomBytes, createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { LoginDto, RegisterDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "./session.types";

const refreshTokenBytes = 32;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;

type WorkspaceMembershipRecord = {
  role: AuthenticatedUser["workspaces"][number]["role"];
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

type EmailLoginUserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  authProvider?: string;
  googleId?: string | null;
  emailVerifiedAt?: Date | null;
  memberships: WorkspaceMembershipRecord[];
};

type SessionUserRecord = EmailLoginUserRecord;

type AuthSessionRecord = {
  revokedAt: Date | null;
  expiresAt: Date;
  user: SessionUserRecord;
};

type AuthRequestContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type AuthSessionResult = AuthenticatedUser & {
  refreshToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService
  ) {}

  async register(
    input: RegisterDto,
    context: AuthRequestContext = {}
  ): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(input.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ConflictException("Email ja cadastrado");
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const name = input.name.trim();
    const workspaceName = input.workspaceName.trim();

    const userId = await this.prisma.$transaction(async (tx) => {
      const slug = await this.resolveWorkspaceSlug(workspaceName, tx);
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug
        }
      });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner"
        }
      });

      return user.id;
    });

    return this.createSessionForUser(userId, context);
  }

  async login(
    input: LoginDto,
    context: AuthRequestContext = {}
  ): Promise<AuthSessionResult> {
    const authenticated = await this.validateEmailLogin(input);

    return this.createSessionForUser(authenticated.user.id, context);
  }

  async getSession(refreshToken: string): Promise<AuthenticatedUser> {
    const refreshHash = this.hashRefreshToken(refreshToken);
    const session = (await this.prisma.authSession.findUnique({
      where: { refreshHash },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                workspace: true
              }
            }
          }
        }
      }
    })) as AuthSessionRecord | null;

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw this.invalidCredentials();
    }

    return this.toAuthenticatedUser(session.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        refreshHash: this.hashRefreshToken(refreshToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  async validateEmailLogin(input: LoginDto): Promise<AuthenticatedUser> {
    const email = this.normalizeEmail(input.email);
    const user = (await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (!user?.passwordHash) {
      throw this.invalidCredentials();
    }

    const validPassword = await this.passwordService.verify(
      input.password,
      user.passwordHash
    );

    if (!validPassword) {
      throw this.invalidCredentials();
    }

    return this.toAuthenticatedUser(user);
  }

  private async createSessionForUser(
    userId: string,
    context: AuthRequestContext
  ): Promise<AuthSessionResult> {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    })) as EmailLoginUserRecord | null;

    if (!user) {
      throw this.invalidCredentials();
    }

    const refreshToken = randomBytes(refreshTokenBytes).toString("hex");
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshHash: this.hashRefreshToken(refreshToken),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt
      }
    });

    return {
      ...this.toAuthenticatedUser(user),
      refreshToken,
      expiresAt
    };
  }

  private async resolveWorkspaceSlug(
    workspaceName: string,
    tx: Pick<PrismaService, "workspace">
  ): Promise<string> {
    const baseSlug = this.slugify(workspaceName);
    let candidate = baseSlug;
    let suffix = 2;

    while (
      await tx.workspace.findUnique({
        where: { slug: candidate }
      })
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private toAuthenticatedUser(user: EmailLoginUserRecord): AuthenticatedUser {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider ?? "email",
        emailVerifiedAt: user.emailVerifiedAt ?? null
      },
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role
      }))
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "workspace";
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException("Credenciais invalidas");
  }
}
