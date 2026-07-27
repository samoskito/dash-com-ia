import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGlobalLegacyResourceIssues,
  buildLegacyBackfillWorkspaceInventory,
  type LegacyBillingResource,
  type LegacyBillingSeatRecord,
} from "../src/billing/legacy-billing-backfill.service";

const workspace = {
  id: "workspace_1",
  name: "Cliente legado",
  slug: "cliente-legado",
};

function instance(
  id: string,
  overrides: Partial<LegacyBillingResource> = {},
): LegacyBillingResource {
  return {
    id,
    workspaceId: workspace.id,
    type: "whatsapp_instance",
    provider: "uazapi",
    normalizedPhone: null,
    externalReference: `provider_${id}`,
    activatedAt: new Date("2026-07-01T12:00:00.000Z"),
    ...overrides,
  };
}

function channel(
  id: string,
  phone: string,
  overrides: Partial<LegacyBillingResource> = {},
): LegacyBillingResource {
  return {
    id,
    workspaceId: workspace.id,
    type: "external_channel",
    provider: "umbler",
    normalizedPhone: phone,
    externalReference: `provider_${id}`,
    activatedAt: new Date("2026-07-02T12:00:00.000Z"),
    ...overrides,
  };
}

function seat(
  id: string,
  target: { instanceId?: string; channelId?: string },
): LegacyBillingSeatRecord {
  return {
    id,
    subscriptionId: "subscription_legacy",
    provider: target.instanceId ? "uazapi" : "umbler",
    whatsappInstanceId: target.instanceId ?? null,
    inboundWebhookChannelId: target.channelId ?? null,
  };
}

describe("legacy protected billing inventory", () => {
  it("counts production resources and missing seats without changing eligibility", () => {
    const inventory = buildLegacyBackfillWorkspaceInventory({
      workspace,
      resources: [
        instance("instance_1"),
        channel("channel_1", "5511999999999"),
      ],
      seats: [],
      currentContract: null,
    });

    expect(inventory).toMatchObject({
      activeInstances: 1,
      externalChannels: 1,
      targetCapacity: 2,
      existingSeats: 0,
      missingSeats: 2,
      eligible: true,
      protected: false,
    });
  });

  it("keeps the operation isolated from providers and connection status writes", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../src/billing/legacy-billing-backfill.service.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/PackageAsaasAdapter|UazapiAdapter/u);
    expect(source).not.toMatch(
      /(?:inboundWebhookConnection|inboundWebhookChannel|whatsappInstance)\.update/u,
    );
    expect(source).toContain("isLegacyBackfillEnabled()");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain('isolationLevel: "Serializable"');
  });

  it("blocks a workspace that already has a current commercial contract", () => {
    const inventory = buildLegacyBackfillWorkspaceInventory({
      workspace,
      resources: [channel("channel_1", "5511999999999")],
      seats: [],
      currentContract: {
        id: "subscription_paid",
        contractStatus: "active",
        includedWhatsappNumbersSnapshot: 3,
      },
    });

    expect(inventory.eligible).toBe(false);
    expect(inventory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "current_commercial_contract_exists",
          severity: "blocking",
        }),
      ]),
    );
  });

  it("blocks occupied seats without a corresponding production resource", () => {
    const inventory = buildLegacyBackfillWorkspaceInventory({
      workspace,
      resources: [instance("instance_1")],
      seats: [seat("seat_orphan", { channelId: "missing_channel" })],
      currentContract: null,
    });

    expect(inventory.eligible).toBe(false);
    expect(inventory.orphanedSeats).toBe(1);
    expect(inventory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "seat_without_production_resource",
        }),
      ]),
    );
  });

  it("detects the same connected phone across workspaces before applying", () => {
    const resources = [
      channel("channel_1", "5511999999999"),
      channel("channel_2", "5511999999999", {
        workspaceId: "workspace_2",
      }),
    ];
    const issues = buildGlobalLegacyResourceIssues(resources);

    expect(issues.get(workspace.id)).toEqual([
      expect.objectContaining({
        code: "duplicate_connected_phone",
        severity: "blocking",
      }),
    ]);
    expect(issues.get("workspace_2")).toHaveLength(1);
  });

  it("recognizes an already protected workspace as an idempotent result", () => {
    const inventory = buildLegacyBackfillWorkspaceInventory({
      workspace,
      resources: [
        instance("instance_1"),
        channel("channel_1", "5511999999999"),
      ],
      seats: [
        seat("seat_1", { instanceId: "instance_1" }),
        seat("seat_2", { channelId: "channel_1" }),
      ],
      currentContract: {
        id: "subscription_legacy",
        contractStatus: "legacy_protected",
        includedWhatsappNumbersSnapshot: 2,
      },
    });

    expect(inventory).toMatchObject({
      eligible: true,
      protected: true,
      missingSeats: 0,
      orphanedSeats: 0,
    });
    expect(
      inventory.issues.filter((issue) => issue.severity === "blocking"),
    ).toHaveLength(0);
  });
});
