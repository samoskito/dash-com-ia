import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { WhatsappConnectionsController } from "../src/integrations/whatsapp-connections.controller";
import { WhatsappConnectionsService } from "../src/integrations/whatsapp-connections.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

async function createApp(role: "owner" | "admin" | "member" = "owner") {
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "cliente@wpptrack.com",
        name: "Cliente",
        authProvider: "email",
        emailVerifiedAt: null
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Cliente",
          slug: "cliente",
          role
        }
      ]
    }))
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn((authenticated) => authenticated.workspaces[0])
  };
  const whatsappConnectionsService = {
    listInstances: vi.fn(async () => [
      {
        id: "wpp_1",
        name: "Vendas",
        provider: "uazapi",
        billingStatus: "active",
        providerInstanceId: "provider_instance_1",
        createdAt: "2026-07-02T03:00:00.000Z"
      }
    ]),
    getStatus: vi.fn(async () => ({
      whatsappInstanceId: "wpp_1",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "connected",
      qrCode: null,
      message: "WhatsApp conectado"
    })),
    connectInstance: vi.fn(async () => ({
      whatsappInstanceId: "wpp_1",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "qr_required",
      qrCode: "qr-code-text",
      message: "Escaneie o QR Code"
    })),
    getQr: vi.fn(async () => ({
      whatsappInstanceId: "wpp_1",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "qr_required",
      qrCode: "qr-code-text",
      message: "Escaneie o QR Code"
    })),
    listLabels: vi.fn(async () => [
      {
        id: "label_uuid_1",
        name: "Venda fechada",
        colorHex: "#fed428",
        labelId: "10"
      }
    ])
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [WhatsappConnectionsController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      {
        provide: WhatsappConnectionsService,
        useValue: whatsappConnectionsService
      }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService, whatsappConnectionsService };
}

describe("whatsapp connections controller", () => {
  it("lists instances for the current workspace", async () => {
    const { app, whatsappConnectionsService } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/whatsapp/instances")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("wpp_1");
        expect(body[0].providerInstanceId).toBe("provider_instance_1");
      });

    expect(whatsappConnectionsService.listInstances).toHaveBeenCalledWith(
      "workspace_1"
    );

    await app.close();
  });

  it("returns status for the current workspace instance", async () => {
    const { app, authService, whatsappConnectionsService } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/whatsapp/instances/wpp_1/status")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.connectionStatus).toBe("connected");
        expect(JSON.stringify(body)).not.toContain("refresh-token");
      });

    expect(authService.getSession).toHaveBeenCalledWith("refresh-token");
    expect(whatsappConnectionsService.getStatus).toHaveBeenCalledWith(
      "workspace_1",
      "wpp_1"
    );

    await app.close();
  });

  it("connects and returns qr for the current workspace instance", async () => {
    const { app, whatsappConnectionsService } = await createApp();

    await request(app.getHttpServer())
      .post("/integrations/whatsapp/instances/wpp_1/connect")
      .set("Authorization", "Bearer refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.qrCode).toBe("qr-code-text");
      });

    await request(app.getHttpServer())
      .get("/integrations/whatsapp/instances/wpp_1/qr")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.connectionStatus).toBe("qr_required");
      });

    expect(whatsappConnectionsService.connectInstance).toHaveBeenCalledWith(
      "workspace_1",
      "wpp_1",
      "user_1"
    );
    expect(whatsappConnectionsService.getQr).toHaveBeenCalledWith(
      "workspace_1",
      "wpp_1"
    );

    await app.close();
  });

  it("rejects whatsapp connection requests for workspace members", async () => {
    const { app, whatsappConnectionsService } = await createApp("member");

    await request(app.getHttpServer())
      .post("/integrations/whatsapp/instances/wpp_1/connect")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    expect(whatsappConnectionsService.connectInstance).not.toHaveBeenCalled();

    await app.close();
  });

  it("lists labels for the current workspace instance", async () => {
    const { app, whatsappConnectionsService } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/whatsapp/instances/wpp_1/labels")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          {
            id: "label_uuid_1",
            name: "Venda fechada",
            colorHex: "#fed428",
            labelId: "10"
          }
        ]);
      });

    expect(whatsappConnectionsService.listLabels).toHaveBeenCalledWith(
      "workspace_1",
      "wpp_1"
    );

    await app.close();
  });
});
