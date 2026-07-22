import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { ProviderConversionProductionService } from "../src/inbound-webhook-production/provider-conversion-production.service";
import { PurchaseReviewsController } from "../src/inbound-webhook-production/purchase-reviews.controller";
import { PurchaseReviewsService } from "../src/inbound-webhook-production/purchase-reviews.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

type WorkspaceRole = "owner" | "admin" | "member";

async function createApp(role: WorkspaceRole = "owner") {
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "user@wpptrack.test",
        name: "Usuario",
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Workspace 1",
          slug: "workspace-1",
          role,
        },
      ],
      activeWorkspaceId: "workspace_1",
    })),
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      id: "workspace_1",
      name: "Workspace 1",
      slug: "workspace-1",
      role,
      permissions: {
        canManageIntegrations: role === "owner" || role === "admin",
      },
    })),
  };
  const reviews = {
    list: vi.fn(async () => ({
      reviews: [],
      pendingCount: 0,
      pagination: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      },
    })),
    get: vi.fn(async () => ({ id: "review_1", status: "approved" })),
    updateItems: vi.fn(async () => ({ id: "review_1" })),
    prepareApproval: vi.fn(async () => ({
      providerConversionExecutionId: "execution_1",
    })),
    reject: vi.fn(async () => ({ id: "review_1", status: "rejected" })),
  };
  const production = {
    processExecution: vi.fn(async () => ({ status: "materialized" })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PurchaseReviewsController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      { provide: PurchaseReviewsService, useValue: reviews },
      {
        provide: ProviderConversionProductionService,
        useValue: production,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, production, reviews };
}

describe("purchase reviews controller", () => {
  it("allows workspace members to inspect only the active workspace queue", async () => {
    const { app, reviews } = await createApp("member");

    await request(app.getHttpServer())
      .get("/purchase-reviews?page=1&pageSize=25")
      .set("Authorization", "Bearer refresh-token")
      .expect(200);

    expect(reviews.list).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
    await app.close();
  });

  it("blocks analysts and members from approving a purchase", async () => {
    const { app, production, reviews } = await createApp("member");

    await request(app.getHttpServer())
      .post("/purchase-reviews/review_1/approve")
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "Compra conferida" })
      .expect(403);

    expect(reviews.prepareApproval).not.toHaveBeenCalled();
    expect(production.processExecution).not.toHaveBeenCalled();
    await app.close();
  });

  it("lets an administrator approve and materialize a reviewed purchase", async () => {
    const { app, production, reviews } = await createApp("admin");

    await request(app.getHttpServer())
      .post("/purchase-reviews/review_1/approve")
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "Compra conferida" })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: "review_1", status: "approved" });
      });

    expect(reviews.prepareApproval).toHaveBeenCalledWith(
      "workspace_1",
      "review_1",
      { reason: "Compra conferida" },
      "user_1",
    );
    expect(production.processExecution).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      providerConversionExecutionId: "execution_1",
    });
    expect(reviews.get).toHaveBeenCalledWith("workspace_1", "review_1");
    await app.close();
  });

  it("rejects an approval without an auditable reason", async () => {
    const { app, production, reviews } = await createApp("owner");

    await request(app.getHttpServer())
      .post("/purchase-reviews/review_1/approve")
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "" })
      .expect(400);

    expect(reviews.prepareApproval).not.toHaveBeenCalled();
    expect(production.processExecution).not.toHaveBeenCalled();
    await app.close();
  });
});
