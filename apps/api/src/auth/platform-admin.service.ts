import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";

type PlatformAdminEnv = Record<string, string | undefined>;

export type PlatformAdminUser = {
  id: string;
  email: string;
};

@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    private readonly env: PlatformAdminEnv = process.env
  ) {}

  async assertPlatformAdmin(refreshToken: string): Promise<PlatformAdminUser> {
    const authenticated = await this.authService.getSession(refreshToken);
    const allowedEmails = this.getAllowedEmails();
    const email = authenticated.user.email.trim().toLowerCase();

    if (!allowedEmails.has(email)) {
      throw new ForbiddenException("Backoffice restrito aos administradores da plataforma");
    }

    return {
      id: authenticated.user.id,
      email
    };
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
