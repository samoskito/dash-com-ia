import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type {
  EmailVerificationConfirmDto,
  EmailVerificationConfirmInputDto,
  EmailVerificationStartDto,
  GoogleOAuthStartDto,
  GoogleOAuthStartResultDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetConfirmInputDto,
  PasswordResetRequestDto,
  PasswordResetRequestInputDto,
  RegisterDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "./session.types";

const refreshTokenBytes = 32;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;
const passwordResetTtlMs = 1000 * 60 * 30;
const emailVerificationTtlMs = 1000 * 60 * 60 * 24;

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
type AuthEnv = Record<string, string | undefined>;
type AuthActionTokenType = "password_reset" | "email_verification";
type AuthActionTokenRecord = {
  id: string;
  userId: string;
  type: AuthActionTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type AuthSessionResult = AuthenticatedUser & {
  refreshToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly env: AuthEnv = process.env
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

  getGoogleOAuthStart(
    input: GoogleOAuthStartDto
  ): GoogleOAuthStartResultDto {
    const clientId = this.env.GOOGLE_CLIENT_ID;
    const redirectUri = this.env.GOOGLE_REDIRECT_URI;
    const requiredEnv: Array<[string, string | undefined]> = [
      ["GOOGLE_CLIENT_ID", clientId],
      ["GOOGLE_REDIRECT_URI", redirectUri]
    ];
    const missingEnv = requiredEnv
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingEnv.length > 0) {
      return {
        provider: "google",
        action: "configure_env",
        authorizationUrl: null,
        missingEnv,
        state: null
      };
    }

    const state = this.createOAuthState(input.redirectTo);
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri!,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state
    });

    return {
      provider: "google",
      action: "redirect",
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      missingEnv: [],
      state
    };
  }

  async requestPasswordReset(
    input: PasswordResetRequestInputDto
  ): Promise<PasswordResetRequestDto> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return {
        ok: true,
        delivery: this.getTokenDelivery(),
        devToken: null
      };
    }

    return this.createActionToken(
      user.id,
      "password_reset",
      passwordResetTtlMs
    );
  }

  async resetPassword(
    input: PasswordResetConfirmInputDto
  ): Promise<PasswordResetConfirmDto> {
    const userId = await this.consumeActionToken("password_reset", input.token);
    const passwordHash = await this.passwordService.hash(input.password);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    return { ok: true };
  }

  async requestEmailVerification(
    refreshToken: string
  ): Promise<EmailVerificationStartDto> {
    const authenticated = await this.getSession(refreshToken);
    return this.requestEmailVerificationForUser(authenticated.user.id);
  }

  async requestEmailVerificationForUser(
    userId: string
  ): Promise<EmailVerificationStartDto> {
    await this.assertUserExists(userId);
    return this.createActionToken(
      userId,
      "email_verification",
      emailVerificationTtlMs
    );
  }

  async confirmEmailVerification(
    input: EmailVerificationConfirmInputDto
  ): Promise<EmailVerificationConfirmDto> {
    const userId = await this.consumeActionToken(
      "email_verification",
      input.token
    );
    const emailVerifiedAt = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt }
    });

    return {
      ok: true,
      emailVerifiedAt: emailVerifiedAt.toISOString()
    };
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

  private createOAuthState(redirectTo?: string): string {
    const payload = JSON.stringify({
      redirectTo: redirectTo ?? "/overview",
      nonce: randomBytes(16).toString("hex")
    });

    return Buffer.from(payload).toString("base64url");
  }

  private async createActionToken(
    userId: string,
    type: AuthActionTokenType,
    ttlMs: number
  ): Promise<PasswordResetRequestDto | EmailVerificationStartDto> {
    const token = randomBytes(32).toString("hex");

    await this.prisma.authActionToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hashActionToken(token),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    return {
      ok: true,
      delivery: this.getTokenDelivery(),
      devToken: this.env.AUTH_EXPOSE_DEV_TOKENS === "true" ? token : null
    };
  }

  private async consumeActionToken(
    type: AuthActionTokenType,
    token: string
  ): Promise<string> {
    const record = (await this.prisma.authActionToken.findFirst({
      where: {
        type,
        tokenHash: this.hashActionToken(token),
        usedAt: null
      }
    })) as AuthActionTokenRecord | null;

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Token invalido ou expirado");
    }

    await this.prisma.authActionToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return record.userId;
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw this.invalidCredentials();
    }
  }

  private getTokenDelivery(): "email_queued" | "not_configured" {
    return this.env.EMAIL_PROVIDER ? "email_queued" : "not_configured";
  }

  private hashActionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException("Credenciais invalidas");
  }
}
