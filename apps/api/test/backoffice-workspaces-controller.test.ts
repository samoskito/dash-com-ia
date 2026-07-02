import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeWorkspacesController } from "../src/workspaces/backoffice-workspaces.controller";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

async function createApp() {
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => ({
      id: "user_1",
      email: "owner@wpptrack.com"
    }))
  };
  const workspacesService = {
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
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeWorkspacesController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: WorkspacesService, useValue: workspacesService }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, platformAdminService, workspacesService };
}

describe("backoffice workspaces controller", () => {
  it("returns workspace billing configuration for platform admins", async () => {
    const { app, platformAdminService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/workspaces/workspace_1/billing")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.asaasCustomerId).toBe("cus_asaas_1");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(workspacesService.getBillingConfiguration).toHaveBeenCalledWith(
      "workspace_1"
    );

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

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
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

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
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

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
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

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
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
