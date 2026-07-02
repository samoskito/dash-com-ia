import { describe, expect, it } from "vitest";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  campaignReportRowSchema,
  clientNavigation,
  googleOAuthStartSchema,
  currentWorkspaceSchema,
  diagnosticEventCreateSchema,
  diagnosticEventDetailSchema,
  diagnosticEventListQuerySchema,
  integrationHealthSchema,
  integrationHealthSummarySchema,
  integrationStartActionSchema,
  loginSchema,
  registerSchema,
  workspaceInviteInputSchema,
  workspaceInviteSchema,
  workspaceMemberSchema
} from "../src";

describe("shared contracts", () => {
  it("does not include Clientes in client navigation", () => {
    expect(clientNavigation.map((item) => item.label)).not.toContain("Clientes");
  });

  it("keeps owner/admin/member permission basics", () => {
    expect(canManageWorkspaceBilling("owner")).toBe(true);
    expect(canManageWorkspaceBilling("admin")).toBe(false);
    expect(canManageIntegrations("admin")).toBe(true);
    expect(canViewReports("member")).toBe(true);
  });

  it("validates campaign report rows", () => {
    const parsed = campaignReportRowSchema.parse({
      id: "cmp_1",
      name: "Black Friday WhatsApp",
      status: "active",
      spendCents: 120000,
      metaConversationsStarted: 100,
      costPerMetaConversationCents: 1200,
      realConversations: 80,
      costPerRealConversationCents: 1500,
      leadSubmitted: 30,
      costPerLeadSubmittedCents: 4000,
      qualifiedLead: 12,
      costPerQualifiedLeadCents: 10000,
      purchase: 3,
      costPerPurchaseCents: 40000,
      roas: 4.2
    });

    expect(parsed.purchase).toBe(3);
  });

  it("validates integration health payloads", () => {
    const parsed = integrationHealthSchema.parse({
      provider: "meta",
      status: "disconnected",
      checkedAt: "2026-07-01T21:30:00.000Z",
      message: "Missing credentials"
    });

    expect(parsed.provider).toBe("meta");
    expect(parsed.status).toBe("disconnected");
  });

  it("rejects invalid integration health payloads", () => {
    expect(() =>
      integrationHealthSchema.parse({
        provider: "stripe",
        status: "online",
        checkedAt: "not-a-date"
      })
    ).toThrow();
  });

  it("validates integration health summaries and start actions", () => {
    const summary = integrationHealthSummarySchema.parse({
      checkedAt: "2026-07-02T03:00:00.000Z",
      providers: [
        {
          provider: "meta",
          status: "disconnected",
          checkedAt: "2026-07-02T03:00:00.000Z",
          message: "Missing META_APP_ID or META_APP_SECRET"
        }
      ]
    });
    const action = integrationStartActionSchema.parse({
      provider: "meta",
      action: "configure_env",
      label: "Configurar app Meta",
      missingEnv: ["META_APP_ID", "META_APP_SECRET"]
    });

    expect(summary.providers[0]?.provider).toBe("meta");
    expect(action.missingEnv).toEqual(["META_APP_ID", "META_APP_SECRET"]);
  });

  it("validates login payloads and normalizes email", () => {
    const parsed = loginSchema.parse({
      email: "  OWNER@WPPTRACK.COM  ",
      password: "secret123"
    });

    expect(parsed).toEqual({
      email: "owner@wpptrack.com",
      password: "secret123"
    });
  });

  it("rejects short login passwords", () => {
    expect(() =>
      loginSchema.parse({
        email: "owner@wpptrack.com",
        password: "short"
      })
    ).toThrow();
  });

  it("validates register payloads", () => {
    const parsed = registerSchema.parse({
      name: "Samuel",
      email: "SAMUEL@WPPTRACK.COM",
      password: "strong-password",
      workspaceName: "WppTrack"
    });

    expect(parsed.email).toBe("samuel@wpptrack.com");
    expect(parsed.workspaceName).toBe("WppTrack");
  });

  it("rejects register payloads without a workspace name", () => {
    expect(() =>
      registerSchema.parse({
        name: "S",
        email: "samuel@wpptrack.com",
        password: "strong-password"
      })
    ).toThrow();
  });

  it("validates google oauth start payloads without requiring oauth wiring", () => {
    const parsed = googleOAuthStartSchema.parse({
      redirectTo: "/dashboard"
    });

    expect(parsed.redirectTo).toBe("/dashboard");
  });

  it("validates current workspace, members and invites", () => {
    const workspace = currentWorkspaceSchema.parse({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner",
      permissions: {
        canInviteMembers: true,
        canManageBilling: true,
        canManageIntegrations: true,
        canViewReports: true
      }
    });
    const member = workspaceMemberSchema.parse({
      id: "member_1",
      userId: "user_1",
      email: "owner@wpptrack.com",
      name: "Owner",
      role: "owner",
      joinedAt: "2026-07-02T03:00:00.000Z"
    });
    const inviteInput = workspaceInviteInputSchema.parse({
      email: " ADMIN@WPPTRACK.COM ",
      role: "admin"
    });
    const invite = workspaceInviteSchema.parse({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "pending",
      expiresAt: "2026-07-09T03:00:00.000Z"
    });

    expect(workspace.permissions.canManageBilling).toBe(true);
    expect(member.role).toBe("owner");
    expect(inviteInput.email).toBe("admin@wpptrack.com");
    expect(invite.status).toBe("pending");
  });

  it("rejects owner invites from client-facing workspace API", () => {
    expect(() =>
      workspaceInviteInputSchema.parse({
        email: "owner2@wpptrack.com",
        role: "owner"
      })
    ).toThrow();
  });

  it("validates diagnostic event contracts", () => {
    const create = diagnosticEventCreateSchema.parse({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      status: "error",
      severity: "error",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      summaryPayload: {
        authorization: "secret-token",
        currency: null
      }
    });
    const query = diagnosticEventListQuerySchema.parse({
      source: "meta",
      limit: "25"
    });
    const detail = diagnosticEventDetailSchema.parse({
      id: "diag_1",
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      occurredAt: "2026-07-02T03:00:00.000Z",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      leadId: null,
      phoneHash: null,
      campaignId: null,
      adSetId: null,
      adId: null,
      jobId: null,
      errorCode: "MISSING_CURRENCY",
      summaryPayload: {
        currency: null
      }
    });

    expect(create.source).toBe("meta");
    expect(query.limit).toBe(25);
    expect(detail.errorCode).toBe("MISSING_CURRENCY");
  });
});
