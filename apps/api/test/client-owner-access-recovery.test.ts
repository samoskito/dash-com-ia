import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordService } from "../src/auth/password.service";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeWorkspacesController } from "../src/workspaces/backoffice-workspaces.controller";
import { PlatformWorkspaceAccessService } from "../src/workspaces/platform-workspace-access.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const rawToken = "a".repeat(64);
const expiresAt = new Date("2026-08-24T12:00:00.000Z");

function createServiceHarness(options: {
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
  webOrigin?: string;
} = {}) {
  const previousWebOrigin = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = options.webOrigin ?? "https://wpp.rastrack.app";

  const member = {
    id: "member_owner",
    createdAt: new Date("2026-07-14T12:00:00.000Z"),
    workspace: {
      id: "workspace_client",
      name: "Empresa Cliente",
    },
    user: {
      id: "user_owner",
      name: "Owner Cliente",
      email: "owner@empresa.com",
      passwordHash: options.passwordHash ?? null,
      emailVerifiedAt: options.emailVerifiedAt ?? null,
    },
  };
  const db = {
    user: { ...member.user },
    sessions: [{ id: "session_1", userId: member.user.id, revokedAt: null }],
    tokens: [
      {
        id: "token_old",
        userId: member.user.id,
        type: "account_activation",
        usedAt: null,
      },
    ],
    auditLogs: [] as Array<Record<string, unknown>>,
  };
  const prisma: any = {
    workspaceMember: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.workspaceId === member.workspace.id &&
        where.userId === member.user.id &&
        where.role === "owner"
          ? {
              ...member,
              user: { ...db.user },
            }
          : null,
      ),
    },
    user: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (
          where.id !== db.user.id ||
          (where.passwordHash === null && db.user.passwordHash !== null)
        ) {
          return { count: 0 };
        }

        Object.assign(db.user, data);
        return { count: 1 };
      }),
    },
    authSession: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        db.sessions = db.sessions.map((session) =>
          session.userId === where.userId && session.revokedAt === where.revokedAt
            ? { ...session, ...data }
            : session,
        );
        return { count: 1 };
      }),
    },
    authActionToken: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        db.tokens = db.tokens.map((token) =>
          token.userId === where.userId &&
          token.type === where.type &&
          token.usedAt === where.usedAt
            ? { ...token, ...data }
            : token,
        );
        return { count: 1 };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        db.auditLogs.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (callback: any) => callback(prisma));

  const issueClientOwnerActivationLink = vi.fn(async () => ({
    mode: "activation" as const,
    delivery: "email_queued" as const,
    token: rawToken,
    expiresAt,
    emailAttempted: true,
    actionTokenId: "token_new",
    tokenHashPrefix: "abc123def456",
  }));
  const passwordService = new PasswordService();
  const service = new WorkspacesService(
    prisma,
    passwordService,
    undefined,
    undefined,
    { issueClientOwnerActivationLink } as never,
  );

  return {
    db,
    issueClientOwnerActivationLink,
    member,
    passwordService,
    prisma,
    restoreEnv() {
      if (previousWebOrigin === undefined) {
        delete process.env.WEB_ORIGIN;
        return;
      }

      process.env.WEB_ORIGIN = previousWebOrigin;
    },
    service,
  };
}

async function createControllerApp(options: {
  adminDenied?: boolean;
  alreadyActivated?: boolean;
} = {}) {
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => {
      if (options.adminDenied) {
        throw new ForbiddenException(
          "Backoffice restrito aos administradores da plataforma",
        );
      }

      return {
        id: "user_1",
        email: "owner@wpptrack.com",
        role: "platform_owner",
      };
    }),
  };
  const workspacesService = {
    listClientWorkspaces: vi.fn(),
    provisionClientWorkspace: vi.fn(),
    resendClientOwnerAccess: vi.fn(),
    issueClientOwnerActivationLink: vi.fn(async () => {
      if (options.alreadyActivated) {
        throw new ConflictException({
          code: "already_activated",
          message: "Responsavel ja possui senha",
        });
      }

      return {
        ok: true,
        mode: "activation",
        delivery: "email_queued",
        activationUrl: `https://wpp.rastrack.app/login/activate?token=${rawToken}`,
        expiresAt: expiresAt.toISOString(),
        emailAttempted: true,
      };
    }),
    setClientOwnerPassword: vi.fn(async () => ({
      ok: true,
      userId: "client_1",
      passwordSet: true,
    })),
    listBillingConfigurations: vi.fn(),
    getBillingConfiguration: vi.fn(),
    updateBillingConfiguration: vi.fn(),
    updateOperationalStatus: vi.fn(),
    listBackofficeWhatsappInstances: vi.fn(),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeWorkspacesController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: WorkspacesService, useValue: workspacesService },
      {
        provide: PlatformWorkspaceAccessService,
        useValue: { start: vi.fn(), stop: vi.fn() },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, platformAdminService, workspacesService };
}

describe("client owner access recovery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues an activation link for an owner without password", async () => {
    const harness = createServiceHarness();

    try {
      const result = await harness.service.issueClientOwnerActivationLink(
        harness.member.workspace.id,
        harness.member.user.id,
        "platform_owner",
      );

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("activation");
      expect(result.activationUrl).toContain("/login/activate?token=");
      expect(result.activationUrl).toContain(rawToken);
      expect(result.expiresAt).toBe(expiresAt.toISOString());
      expect(harness.issueClientOwnerActivationLink).toHaveBeenCalledWith({
        userId: harness.member.user.id,
        workspaceId: harness.member.workspace.id,
      });
      expect(JSON.stringify(result)).not.toContain("password");
      expect(JSON.stringify(harness.db.auditLogs)).not.toContain(rawToken);
      expect(harness.db.auditLogs[0]).toMatchObject({
        action: "workspace.client_owner_activation_link_issued",
        actorUserId: "platform_owner",
        afterSummary: expect.objectContaining({
          actionTokenId: "token_new",
          tokenHashPrefix: "abc123def456",
        }),
      });
    } finally {
      harness.restoreEnv();
    }
  });

  it("rejects activation link when the owner already has a password", async () => {
    const harness = createServiceHarness({ passwordHash: "already-set" });

    try {
      await expect(
        harness.service.issueClientOwnerActivationLink(
          harness.member.workspace.id,
          harness.member.user.id,
          "platform_owner",
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: "already_activated" }),
      });
      expect(harness.issueClientOwnerActivationLink).not.toHaveBeenCalled();
    } finally {
      harness.restoreEnv();
    }
  });

  it("sets a password that PasswordService can verify and redacts secrets from audit", async () => {
    const harness = createServiceHarness();
    const password = "strong-new-password";

    try {
      const result = await harness.service.setClientOwnerPassword(
        harness.member.workspace.id,
        harness.member.user.id,
        {
          password,
          confirmPassword: password,
          confirm: true,
        },
        "platform_owner",
      );

      expect(result).toEqual({
        ok: true,
        userId: harness.member.user.id,
        passwordSet: true,
      });
      expect(dbUserHasUsablePassword(harness.db.user.passwordHash)).toBe(true);
      await expect(
        harness.passwordService.verify(password, harness.db.user.passwordHash!),
      ).resolves.toBe(true);
      expect(harness.db.user.emailVerifiedAt).toBeInstanceOf(Date);
      expect(harness.db.sessions[0]?.revokedAt).toBeInstanceOf(Date);
      expect(harness.db.tokens[0]?.usedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(harness.db.auditLogs)).not.toContain(password);
      expect(harness.db.auditLogs[0]).toMatchObject({
        action: "workspace.client_owner_password_set",
        actorUserId: "platform_owner",
        afterSummary: expect.objectContaining({
          passwordSet: true,
          userId: harness.member.user.id,
        }),
      });
    } finally {
      harness.restoreEnv();
    }
  });

  it("rejects set-password when the owner already has a password", async () => {
    const harness = createServiceHarness({ passwordHash: "already-set" });

    try {
      await expect(
        harness.service.setClientOwnerPassword(
          harness.member.workspace.id,
          harness.member.user.id,
          {
            password: "another-strong-password",
            confirmPassword: "another-strong-password",
            confirm: true,
          },
          "platform_owner",
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: "already_activated" }),
      });
      expect(harness.prisma.user.updateMany).not.toHaveBeenCalled();
    } finally {
      harness.restoreEnv();
    }
  });

  it("returns the generated activation link for platform admins", async () => {
    const { app, workspacesService } = await createControllerApp();

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/activation-link")
      .set("Authorization", "Bearer refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.activationUrl).toContain("/login/activate?token=");
        expect(body.expiresAt).toBe(expiresAt.toISOString());
        expect(JSON.stringify(body)).not.toContain("password");
      });

    expect(workspacesService.issueClientOwnerActivationLink).toHaveBeenCalledWith(
      "workspace_1",
      "client_1",
      "user_1",
    );
    await app.close();
  });

  it("denies activation-link to non-admins", async () => {
    const { app, workspacesService } = await createControllerApp({
      adminDenied: true,
    });

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/activation-link")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    expect(workspacesService.issueClientOwnerActivationLink).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 409 from activation-link when the owner already has a password", async () => {
    const { app } = await createControllerApp({ alreadyActivated: true });

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/activation-link")
      .set("Authorization", "Bearer refresh-token")
      .expect(409);

    await app.close();
  });

  it("rejects set-password when confirmation is missing or passwords mismatch", async () => {
    const { app, workspacesService } = await createControllerApp();

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/set-password")
      .set("Authorization", "Bearer refresh-token")
      .send({
        password: "strong-password",
        confirmPassword: "other-password",
        confirm: true,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/set-password")
      .set("Authorization", "Bearer refresh-token")
      .send({
        password: "strong-password",
        confirmPassword: "strong-password",
      })
      .expect(400);

    expect(workspacesService.setClientOwnerPassword).not.toHaveBeenCalled();
    await app.close();
  });
});

function dbUserHasUsablePassword(passwordHash: string | null): boolean {
  return typeof passwordHash === "string" && passwordHash.length > 20;
}
