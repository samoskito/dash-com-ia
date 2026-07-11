import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional
} from "@nestjs/common";
import type { PlatformRole } from "@wpptrack/shared";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { AuthService } from "./auth.service";

export type PlatformAdminUser = {
  id: string;
  email: string;
  role: PlatformRole;
};

@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env
  ) {}

  async assertPlatformAdmin(refreshToken: string): Promise<PlatformAdminUser> {
    const authenticated = await this.authService.getSession(refreshToken);
    const allowedEmails = this.getAllowedEmails();
    const email = authenticated.user.email.trim().toLowerCase();
    const role =
      authenticated.user.platformRole ??
      (allowedEmails.has(email) ? "platform_owner" : null);

    if (!role) {
      throw new ForbiddenException("Backoffice restrito aos administradores da plataforma");
    }

    return {
      id: authenticated.user.id,
      email,
      role
    };
  }

  async assertPlatformOwner(refreshToken: string): Promise<PlatformAdminUser> {
    const admin = await this.assertPlatformAdmin(refreshToken);

    if (admin.role !== "platform_owner") {
      throw new ForbiddenException("Acao restrita ao proprietario da plataforma");
    }

    return admin;
  }

  private getAllowedEmails(): Set<string> {
    return new Set(
      (this.env.WPPTRACK_PLATFORM_ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    );
  }
}
