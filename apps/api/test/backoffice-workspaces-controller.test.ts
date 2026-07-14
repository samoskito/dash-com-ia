import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeWorkspacesController } from "../src/workspaces/backoffice-workspaces.controller";
import { WorkspacesService } from "../src/workspaces/workspaces.service";
import { PlatformWorkspaceAccessService } from "../src/workspaces/platform-workspace-access.service";

async function createApp() {
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => ({
      id: "user_1",
      email: "owner@wpptrack.com",
      role: "platform_owner"
    }))
  };
  const workspacesService = {
    listClientWorkspaces: vi.fn(async () => [
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        operationalStatus: "active",
        createdAt: "2026-07-02T03:00:00.000Z",
        owners: [{ id: "client_1", name: "Cliente", email: "cliente@empresa.com" }],
        connectorCount: 1
      }
    ]),
    provisionClientWorkspace: vi.fn(async () => ({
      workspace: {
        id: "workspace_3",
        name: "Barbieri",
        slug: "barbieri",
        operationalStatus: "active"
      },
      owner: {
        id: "client_3",
        name: "Cliente Barbieri",
        email: "cliente@barbieri.com.br",
        role: "owner"
      },
      access: {
        mode: "activation",
        delivery: "email_queued"
      }
    })),
    resendClientOwnerAccess: vi.fn(async () => ({
      ok: true,
      access: {
        mode: "activation",
        delivery: "email_queued"
      }
    })),
    listBillingConfigurations: vi.fn(async () => [
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: "cus_asaas_1",
        operationalStatus: "active"
      },
      {
        id: "workspace_2",
        name: "Clinica Norte",
        slug: "clinica-norte",
        asaasCustomerId: null,
        operationalStatus: "blocked"
      }
    ]),
    getBillingConfiguration: vi.fn(async () => ({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_1",
      operationalStatus: "active"
    })),
    updateBillingConfiguration: vi.fn(async () => ({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_2",
      operationalStatus: "active"
    })),
    updateOperationalStatus: vi.fn(async () => ({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_1",
      operationalStatus: "blocked"
    })),
    listBackofficeWhatsappInstances: vi.fn(async () => [
      {
        id: "wpp_1",
        workspaceId: "workspace_1",
        workspaceName: "Comunidade NOD",
        name: "Comercial",
        provider: "uazapi",
        billingStatus: "active",
        providerInstanceId: "uazapi_1",
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:10:00.000Z"
      }
    ])
  };
  const platformWorkspaceAccessService = {
    start: vi.fn(async () => ({
      workspaceId: "workspace_1",
      workspaceName: "Comunidade NOD",
      workspaceSlug: "comunidade-nod",
      startedAt: "2026-07-11T18:00:00.000Z"
    })),
    stop: vi.fn(async () => ({ ok: true }))
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeWorkspacesController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: WorkspacesService, useValue: workspacesService },
      {
        provide: PlatformWorkspaceAccessService,
        useValue: platformWorkspaceAccessService
      }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    platformAdminService,
    platformWorkspaceAccessService,
    workspacesService
  };
}

describe("backoffice workspaces controller", () => {
  it("lists customer workspaces for platform operators", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/workspaces")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].owners[0].email).toBe("cliente@empresa.com");
      });

    expect(workspacesService.listClientWorkspaces).toHaveBeenCalled();
    await app.close();
  });

  it("provisions an isolated workspace and its first owner", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/workspaces")
      .set("Authorization", "Bearer refresh-token")
      .send({
        workspaceName: "Barbieri",
        ownerName: "Cliente Barbieri",
        ownerEmail: "cliente@barbieri.com.br"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.workspace.slug).toBe("barbieri");
        expect(body.owner.role).toBe("owner");
        expect(body.access.delivery).toBe("email_queued");
        expect(JSON.stringify(body)).not.toContain("password");
      });

    expect(workspacesService.provisionClientWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: "cliente@barbieri.com.br" }),
      "user_1"
    );
    await app.close();
  });

  it("resends access to an explicitly scoped workspace owner", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/owners/client_1/access-email")
      .set("Authorization", "Bearer refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          ok: true,
          access: { mode: "activation", delivery: "email_queued" }
        });
      });

    expect(workspacesService.resendClientOwnerAccess).toHaveBeenCalledWith(
      "workspace_1",
      "client_1",
      "user_1"
    );
    await app.close();
  });

  it("starts and ends an audited support workspace context", async () => {
    const { app, platformWorkspaceAccessService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/workspaces/workspace_1/support-access")
      .set("Authorization", "Bearer refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
      });
    await request(app.getHttpServer())
      .delete("/backoffice/workspaces/support-access")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect({ ok: true });

    expect(platformWorkspaceAccessService.start).toHaveBeenCalledWith(
      "refresh-token",
      "workspace_1",
      expect.objectContaining({ id: "user_1" })
    );
    expect(platformWorkspaceAccessService.stop).toHaveBeenCalledWith(
      "refresh-token",
      expect.objectContaining({ id: "user_1" })
    );
    await app.close();
  });

  it("returns workspace billing configuration for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/workspaces/workspace_1/billing")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.asaasCustomerId).toBe("cus_asaas_1");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.getBillingConfiguration).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("lists workspace billing configurations for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/workspaces/billing")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(2);
        expect(body[1].asaasCustomerId).toBeNull();
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.listBillingConfigurations).toHaveBeenCalled();

    await app.close();
  });

  it("lists whatsapp instances across workspaces for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/workspaces/whatsapp-instances")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].workspaceName).toBe("Comunidade NOD");
        expect(body[0].providerInstanceId).toBe("uazapi_1");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.listBackofficeWhatsappInstances).toHaveBeenCalled();

    await app.close();
  });

  it("updates workspace Asaas customer id for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .patch("/backoffice/workspaces/workspace_1/billing")
      .set("Authorization", "Bearer refresh-token")
      .send({
        asaasCustomerId: "cus_asaas_2"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.asaasCustomerId).toBe("cus_asaas_2");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.updateBillingConfiguration).toHaveBeenCalledWith(
      "workspace_1",
      {
        asaasCustomerId: "cus_asaas_2"
      },
      "user_1"
    );

    await app.close();
  });

  it("updates workspace operational status for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .patch("/backoffice/workspaces/workspace_1/operational-status")
      .set("Authorization", "Bearer refresh-token")
      .send({
        operationalStatus: "blocked"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.operationalStatus).toBe("blocked");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.updateOperationalStatus).toHaveBeenCalledWith(
      "workspace_1",
      {
        operationalStatus: "blocked"
      },
      "user_1"
    );

    await app.close();
  });
});
