import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";

describe("platform admin service", () => {
  it("allows authenticated users listed in WPPTRACK_PLATFORM_ADMIN_EMAILS", async () => {
    const authService = {
      getSession: vi.fn(async () => ({
        user: {
          id: "user_1",
          email: "owner@wpptrack.com",
          name: "Owner",
          authProvider: "email",
          emailVerifiedAt: null
        },
        workspaces: []
      }))
    };
    const service = new PlatformAdminService(authService as never, {
      WPPTRACK_PLATFORM_ADMIN_EMAILS: " owner@wpptrack.com, socio@wpptrack.com "
    });

    const admin = await service.assertPlatformAdmin("refresh-token");

    expect(admin.email).toBe("owner@wpptrack.com");
    expect(authService.getSession).toHaveBeenCalledWith("refresh-token");
  });

  it("rejects authenticated users outside the platform allowlist", async () => {
    const authService = {
      getSession: vi.fn(async () => ({
        user: {
          id: "user_1",
          email: "cliente@empresa.com",
          name: "Cliente",
          authProvider: "email",
          emailVerifiedAt: null
        },
        workspaces: []
      }))
    };
    const service = new PlatformAdminService(authService as never, {
      WPPTRACK_PLATFORM_ADMIN_EMAILS: "owner@wpptrack.com"
    });

    await expect(service.assertPlatformAdmin("refresh-token")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
