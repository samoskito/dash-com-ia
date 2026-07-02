import { describe, expect, it } from "vitest";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  campaignReportRowSchema,
  clientNavigation,
  googleOAuthStartSchema,
  integrationHealthSchema,
  loginSchema,
  registerSchema
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

  it("validates register payloads", () => {
    const parsed = registerSchema.parse({
      name: "Samuel",
      email: "SAMUEL@WPPTRACK.COM",
      password: "strong-password"
    });

    expect(parsed.email).toBe("samuel@wpptrack.com");
  });

  it("validates google oauth start payloads without requiring oauth wiring", () => {
    const parsed = googleOAuthStartSchema.parse({
      redirectUri: "https://app.wpptrack.com/auth/google/callback"
    });

    expect(parsed.redirectUri).toBe(
      "https://app.wpptrack.com/auth/google/callback"
    );
  });
});
