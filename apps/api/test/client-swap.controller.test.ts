import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ClientSwapModule } from "../src/workspaces/client-swap/client-swap.module";
import { ClientSwapService } from "../src/workspaces/client-swap/client-swap.service";

const ownerSession = {
  user: {
    id: "user_1",
    email: "owner@wpptrack.com",
  },
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner",
    },
  ],
};

const memberSession = {
  user: {
    id: "user_2",
    email: "member@wpptrack.com",
  },
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "member",
    },
  ],
};

const adminSession = {
  user: {
    id: "user_3",
    email: "admin@wpptrack.com",
  },
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "admin",
    },
  ],
};

const supportContext = {
  workspaceId: "workspace_1",
  workspaceName: "Comunidade NOD",
  workspaceSlug: "comunidade-nod",
  operationalStatus: "active" as const,
  startedAt: "2026-07-11T18:00:00.000Z",
};

const platformOwnerSupportSession = {
  user: {
    id: "user_platform_owner",
    email: "owner@wpptrack.com",
    platformRole: "platform_owner" as const,
  },
  workspaces: [] as Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>,
  supportContext,
};

const platformOwnerOtherWorkspaceSupportSession = {
  ...platformOwnerSupportSession,
  supportContext: {
    ...supportContext,
    workspaceId: "workspace_other",
  },
};

const platformOperatorSupportSession = {
  user: {
    id: "user_platform_operator",
    email: "operator@wpptrack.com",
    platformRole: "platform_operator" as const,
  },
  workspaces: [] as Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>,
  supportContext,
};

const platformOwnerPlainSession = {
  user: {
    id: "user_platform_owner",
    email: "owner@wpptrack.com",
    platformRole: "platform_owner" as const,
  },
  workspaces: [] as Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>,
  supportContext: null,
};

type ClientSwapTestSession =
  | typeof ownerSession
  | typeof memberSession
  | typeof adminSession
  | typeof platformOwnerSupportSession
  | typeof platformOwnerOtherWorkspaceSupportSession
  | typeof platformOperatorSupportSession
  | typeof platformOwnerPlainSession;

async function createApp(options: {
  session?: ClientSwapTestSession;
  unauthorized?: boolean;
} = {}) {
  const authService = {
    getSession: vi.fn(async () => {
      if (options.unauthorized) {
        throw new UnauthorizedException("Sessão inválida ou expirada");
      }
      return options.session ?? ownerSession;
    }),
  };
  const clientSwapService = {
    swap: vi.fn(async () => ({
      success: true,
      wipedCounts: { lead: 1 },
      workspace: {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        operationalStatus: "active",
      },
    })),
  };
  const prisma = {
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [ClientSwapModule],
  })
    .overrideProvider(AuthService)
    .useValue(authService)
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(ClientSwapService)
    .useValue(clientSwapService)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService, clientSwapService, prisma };
}

describe("client swap controller", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("executes swap for an owner with confirm:true and idempotency key", async () => {
    const harness = await createApp();
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true, newClientName: "Novo Cliente" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
        expect(body.workspace.id).toBe("workspace_1");
      });

    expect(harness.clientSwapService.swap).toHaveBeenCalledWith(
      "workspace_1",
      "user_1",
      { confirm: true, newClientName: "Novo Cliente" },
      "swap-key-1",
    );
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 400 and does not wipe when confirm is missing or false", async () => {
    const harness = await createApp();
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: false })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe("Payload invalido");
      });

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({})
      .expect(400);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-owner before any idempotency write", async () => {
    const harness = await createApp({ session: memberSession });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(403);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is missing", async () => {
    const harness = await createApp();
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(401);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is invalid", async () => {
    const harness = await createApp({ unauthorized: true });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(401);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
  });

  it("allows platform_owner with active support context for the same workspace", async () => {
    const harness = await createApp({ session: platformOwnerSupportSession });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(200);

    expect(harness.clientSwapService.swap).toHaveBeenCalledWith(
      "workspace_1",
      "user_platform_owner",
      { confirm: true },
      "swap-key-1",
      "platform_admin",
    );
  });

  it("returns 403 when platform_owner support context is for a different workspace", async () => {
    const harness = await createApp({
      session: platformOwnerOtherWorkspaceSupportSession,
    });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(403);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
  });

  it("returns 403 for platform_operator even with matching support context", async () => {
    const harness = await createApp({ session: platformOperatorSupportSession });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(403);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
  });

  it("returns 403 for platform_owner without support context", async () => {
    const harness = await createApp({ session: platformOwnerPlainSession });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(403);

    expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
  });

  it("still allows a regular workspace owner member", async () => {
    const harness = await createApp({ session: ownerSession });
    apps.push(harness.app);

    await request(harness.app.getHttpServer())
      .post("/workspaces/workspace_1/client-swap")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "swap-key-1")
      .send({ confirm: true })
      .expect(200);

    expect(harness.clientSwapService.swap).toHaveBeenCalledWith(
      "workspace_1",
      "user_1",
      { confirm: true },
      "swap-key-1",
    );
  });

  it("returns 403 for member and admin roles", async () => {
    for (const session of [memberSession, adminSession]) {
      const harness = await createApp({ session });
      apps.push(harness.app);

      await request(harness.app.getHttpServer())
        .post("/workspaces/workspace_1/client-swap")
        .set("Authorization", "Bearer refresh-token")
        .set("Idempotency-Key", "swap-key-1")
        .send({ confirm: true })
        .expect(403);

      expect(harness.clientSwapService.swap).not.toHaveBeenCalled();
    }
  });
});
