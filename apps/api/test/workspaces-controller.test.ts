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
  activeWorkspaceId: "workspace_1",
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner"
    }
  ]
};

const ownerPermissions = {
  canInviteMembers: true,
  canManageMembers: true,
  canGrantMemberManager: true,
  canManageBilling: true,
  canManageIntegrations: true,
  canManageWorkspaceSettings: true,
  canTransferOwnership: true,
  canViewReports: true,
  canExportReports: true
};

async function createApp() {
  const authService = {
    getSession: vi.fn(async () => session),
    setActiveWorkspace: vi.fn(async () => undefined)
  };
  const workspacesService = {
    listAvailableWorkspaces: vi.fn(() =>
      session.workspaces.map((workspace) => ({
        ...workspace,
        permissions: ownerPermissions
      }))
    ),
    getCurrentWorkspace: vi.fn(() => ({
      ...session.workspaces[0],
      permissions: ownerPermissions
    })),
    listMembers: vi.fn(async () => [
      {
        id: "member_1",
        userId: "user_1",
        email: "owner@wpptrack.com",
        name: "Owner",
        role: "owner",
        canManageMembers: false,
        joinedAt: "2026-07-02T03:00:00.000Z"
      }
    ]),
    listInvites: vi.fn(async () => [
      {
        id: "invite_1",
        email: "admin@wpptrack.com",
        role: "admin",
        status: "pending",
        expiresAt: "2026-07-09T03:00:00.000Z"
      }
    ]),
    updateCurrentWorkspace: vi.fn(async () => ({
      ...session.workspaces[0],
      name: "Loja Samuel",
      permissions: ownerPermissions
    })),
    createInvite: vi.fn(async () => ({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "pending",
      expiresAt: "2026-07-09T03:00:00.000Z",
      acceptToken: "invite-token-1234567890"
    })),
    updateMemberRole: vi.fn(async () => ({
      id: "member_2",
      userId: "user_2",
      email: "admin@wpptrack.com",
      name: "Admin",
      role: "member",
      canManageMembers: false,
      joinedAt: "2026-07-02T04:00:00.000Z"
    })),
    updateMemberManagerCapability: vi.fn(async () => ({
      id: "member_2",
      userId: "user_2",
      email: "admin@wpptrack.com",
      name: "Admin",
      role: "admin",
      canManageMembers: true,
      joinedAt: "2026-07-02T04:00:00.000Z"
    })),
    removeMember: vi.fn(async () => ({
      memberId: "member_2",
      status: "removed"
    })),
    resendInvite: vi.fn(async () => ({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "pending",
      expiresAt: "2026-07-16T03:00:00.000Z",
      acceptToken: "rotated-token-1234567890"
    })),
    revokeInvite: vi.fn(async () => ({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "revoked",
      expiresAt: "2026-07-09T03:00:00.000Z"
    })),
    acceptInvite: vi.fn(async () => ({
      workspaceId: "workspace_1",
      memberId: "member_2",
      role: "admin",
      status: "accepted"
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
  it("lists only the authenticated user's workspace memberships", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/workspaces")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          expect.objectContaining({
            id: "workspace_1",
            role: "owner",
            permissions: ownerPermissions
          })
        ]);
      });

    expect(workspacesService.listAvailableWorkspaces).toHaveBeenCalledWith(
      session
    );

    await app.close();
  });

  it("switches the active workspace and returns the resolved context", async () => {
    const { app, authService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .post("/workspaces/active")
      .set("Authorization", "Bearer refresh-token")
      .send({ workspaceId: "workspace_1" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe("workspace_1");
      });

    expect(authService.setActiveWorkspace).toHaveBeenCalledWith(
      "refresh-token",
      "workspace_1"
    );
    expect(workspacesService.getCurrentWorkspace).toHaveBeenCalledWith(session);

    await app.close();
  });

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

  it("updates the current workspace profile", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .patch("/workspaces/current")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: " Loja Samuel "
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe("Loja Samuel");
        expect(body.slug).toBe("comunidade-nod");
      });

    expect(workspacesService.updateCurrentWorkspace).toHaveBeenCalledWith(
      session,
      {
        name: "Loja Samuel"
      }
    );

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

  it("returns pending invites for the current workspace", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .get("/workspaces/current/invites")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].email).toBe("admin@wpptrack.com");
        expect(body[0].status).toBe("pending");
        expect(body[0].acceptToken).toBeUndefined();
      });

    expect(workspacesService.listInvites).toHaveBeenCalledWith("workspace_1");

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
        expect(body.acceptToken).toBe("invite-token-1234567890");
      });

    expect(workspacesService.createInvite).toHaveBeenCalledWith(session, {
      email: "admin@wpptrack.com",
      role: "admin"
    });

    await app.close();
  });

  it("updates member roles and delegated team management", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .patch("/workspaces/current/members/member_2/role")
      .set("Authorization", "Bearer refresh-token")
      .send({ role: "member" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.role).toBe("member");
      });
    await request(app.getHttpServer())
      .patch("/workspaces/current/members/member_2/member-manager")
      .set("Authorization", "Bearer refresh-token")
      .send({ canManageMembers: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.canManageMembers).toBe(true);
      });

    expect(workspacesService.updateMemberRole).toHaveBeenCalledWith(
      session,
      "member_2",
      { role: "member" }
    );
    expect(
      workspacesService.updateMemberManagerCapability
    ).toHaveBeenCalledWith(session, "member_2", {
      canManageMembers: true
    });

    await app.close();
  });

  it("removes members and manages pending invitations", async () => {
    const { app, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .delete("/workspaces/current/members/member_2")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("removed");
      });
    await request(app.getHttpServer())
      .post("/workspaces/current/invites/invite_1/resend")
      .set("Authorization", "Bearer refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.acceptToken).toBe("rotated-token-1234567890");
      });
    await request(app.getHttpServer())
      .delete("/workspaces/current/invites/invite_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("revoked");
      });

    expect(workspacesService.removeMember).toHaveBeenCalledWith(
      session,
      "member_2"
    );
    expect(workspacesService.resendInvite).toHaveBeenCalledWith(
      session,
      "invite_1"
    );
    expect(workspacesService.revokeInvite).toHaveBeenCalledWith(
      session,
      "invite_1"
    );

    await app.close();
  });

  it("accepts pending workspace invites for the authenticated invited user", async () => {
    const { app, authService, workspacesService } = await createApp();

    await request(app.getHttpServer())
      .post("/workspaces/invites/accept")
      .set("Authorization", "Bearer refresh-token")
      .send({
        token: "invite-token-1234567890"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("accepted");
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.memberId).toBe("member_2");
      });

    expect(workspacesService.acceptInvite).toHaveBeenCalledWith(session, {
      token: "invite-token-1234567890"
    });
    expect(authService.setActiveWorkspace).toHaveBeenCalledWith(
      "refresh-token",
      "workspace_1"
    );

    await app.close();
  });
});
