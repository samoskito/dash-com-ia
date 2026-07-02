import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { LoginDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "./session.types";

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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService
  ) {}

  async validateEmailLogin(input: LoginDto): Promise<AuthenticatedUser> {
    const email = input.email.trim().toLowerCase();
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

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException("Credenciais invalidas");
  }
}
