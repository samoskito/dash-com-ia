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
    getBillingConfiguration: vi.fn(async () => ({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_1"
    })),
    updateBillingConfiguration: vi.fn(async () => ({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_2"
    }))
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
      }
    );

    await app.close();
  });
});
