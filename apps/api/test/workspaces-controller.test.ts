import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { WorkspacesController } from "../src/workspaces/workspaces.controller";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const session = {
  user: {
    id: "user_1",
    email: "owner@wpptrack.com",
    name: "Owner",
    authProvider: "email",
    emailVerifiedAt: null
  },
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner"
    }
  ]
};

async function createApp() {
  const authService = {
    getSession: vi.fn(async () => session)
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      ...session.workspaces[0],
      permissions: {
        canInviteMembers: true,
        canManageBilling: true,
        canManageIntegrations: true,
        canViewReports: true
      }
    })),
    listMembers: vi.fn(async () => [
      {
        id: "member_1",
        userId: "user_1",
        email: "owner@wpptrack.com",
        name: "Owner",
        role: "owner",
        joinedAt: "2026-07-02T03:00:00.000Z"
      }
    ]),
    createInvite: vi.fn(async () => ({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "pending",
      expiresAt: "2026-07-09T03:00:00.000Z"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [WorkspacesController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService, workspacesService };
}

describe("workspaces controller", () => {
  it("returns the current workspace with permissions", async () => {
    const { app, authService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/workspaces/current")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.slug).toBe("comunidade-nod");
        expect(body.permissions.canManageBilling).toBe(true);
      });

    expect(authService.getSession).toHaveBeenCalledWith("refresh-token");
    expect(workspacesService.getCurrentWorkspace).toHaveBeenCalledWith(session);

    await app.close();
  });

  it("returns members for the current workspace", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/workspaces/current/members")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].email).toBe("owner@wpptrack.com");
        expect(body[0].role).toBe("owner");
      });

    expect(workspacesService.listMembers).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("creates pending workspace invites", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .post("/workspaces/current/invites")
      .set("Authorization", "Bearer refresh-token")
      .send({
        email: " ADMIN@WPPTRACK.COM ",
        role: "admin"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.email).toBe("admin@wpptrack.com");
        expect(body.status).toBe("pending");
      });

    expect(workspacesService.createInvite).toHaveBeenCalledWith(session, {
      email: "admin@wpptrack.com",
      role: "admin"
    });

    await app.close();
  });
});
