import { describe, expect, it } from "vitest";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  campaignReportRowSchema,
  clientNavigation
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
});
