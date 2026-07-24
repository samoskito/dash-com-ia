import { ConflictException } from "@nestjs/common";
import type { BackofficeProviderConversionRolloutDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import type { ProviderConversionDecisionRepository } from "../src/conversion-rules/provider-conversion-decision.repository";
import { BackofficeInboundWebhooksService } from "../src/inbound-webhooks/backoffice-inbound-webhooks.service";
import type { InboundConversionAutomationIngestionService } from "../src/inbound-webhooks/inbound-conversion-automation-ingestion.service";
import type { InboundWebhookObservationService } from "../src/inbound-webhooks/inbound-webhook-observation.service";
import type { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { InboundWebhookQueueService } from "../src/inbound-webhooks/inbound-webhook-queue.service";

const actor = {
  id: "platform_owner_1",
  actorType: "platform_owner",
  sourceIp: "203.0.113.10",
};

function rolloutResult(
  mode: "legacy" | "shadow" | "canonical",
): BackofficeProviderConversionRolloutDto {
  return {
    channel: {
      id: "channel_1",
      displayName: "Comercial",
      connectedPhone: "+5511999999999",
      mode,
    },
    counts: {
      comparisons: 20,
      matches: 19,
      mismatches: 1,
    },
    filteredCounts: {
      comparisons: 20,
      matches: 19,
      mismatches: 1,
    },
    pagination: {
      offset: 0,
      limit: 30,
      total: 20,
      hasPrevious: false,
      hasNext: false,
    },
    mismatchReasons: [
      {
        code: "decision_code",
        count: 1,
      },
    ],
    latestComparisonAt: "2026-07-23T18:00:00.000Z",
    canActivateCanonical: mode !== "legacy",
    canonicalBlocker:
      mode === "legacy"
        ? "Ative o modo shadow antes de promover este canal."
        : null,
    comparisons: [],
  };
}

function createHarness(input?: {
  mode?: "legacy" | "shadow" | "canonical";
  comparisonCount?: number;
  mismatchCount?: number;
}) {
  let currentMode = input?.mode ?? "shadow";
  const comparisonCount = input?.comparisonCount ?? 20;
  const mismatchCount = input?.mismatchCount ?? 1;
  const transaction = {
    inboundWebhookChannel: {
      update: vi.fn(
        async ({
          data,
        }: {
          data: {
            conversionEngineMode: "legacy" | "shadow" | "canonical";
          };
        }) => {
          currentMode = data.conversionEngineMode;
          return { id: "channel_1" };
        },
      ),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_1" })),
    },
  };
  const prisma = {
    inboundWebhookChannel: {
      findUnique: vi.fn(async () => ({
        id: "channel_1",
        workspaceId: "workspace_1",
        channelName: "Comercial",
        connectedPhone: "+5511999999999",
        conversionEngineMode: currentMode,
      })),
    },
    providerConversionShadowComparison: {
      count: vi.fn(
        async ({
          where,
        }: {
          where: {
            matches?: boolean;
          };
        }) => (where.matches === false ? mismatchCount : comparisonCount),
      ),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const service = new BackofficeInboundWebhooksService(
    prisma as unknown as PrismaService,
    {} as InboundWebhookPayloadEncryptionService,
    {} as InboundWebhookQueueService,
    {} as ProviderConversionDecisionRepository,
    {} as InboundWebhookObservationService,
    {} as InboundConversionAutomationIngestionService,
  );
  vi.spyOn(service, "getProviderConversionRollout").mockImplementation(
    async () => rolloutResult(currentMode),
  );

  return {
    prisma,
    service,
    transaction,
    get mode() {
      return currentMode;
    },
  };
}

describe("backoffice provider conversion rollout", () => {
  it("filters and paginates high-volume shadow evidence in the database", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(1_200)
      .mockResolvedValueOnce(1_190)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(7);
    const findMany = vi.fn(async () => [
      {
        id: "comparison_41",
        occurrenceKey: "message_41:rule_1",
        authoritativeEngine: "legacy",
        matches: false,
        mismatchCode: "decision_code_mismatch",
        legacyEngineVersion: "legacy-v1",
        legacyDecisionCode: "eligible",
        legacyReasonCode: "catalog_match",
        canonicalEngineVersion: "canonical-v1",
        canonicalDecisionCode: "review_required",
        canonicalReasonCode: "catalog_ambiguous",
        sourceDeliveryId: "delivery_41",
        createdAt: new Date("2026-07-24T13:40:00.000Z"),
        providerRule: {
          conversionRule: {
            eventName: "Purchase",
          },
        },
      },
    ]);
    const prisma = {
      inboundWebhookChannel: {
        findUnique: vi.fn(async () => ({
          id: "channel_1",
          workspaceId: "workspace_1",
          channelName: "Comercial",
          connectedPhone: "+5511999999999",
          conversionEngineMode: "shadow",
        })),
      },
      providerConversionShadowComparison: {
        count,
        groupBy: vi.fn(async () => [
          {
            mismatchCode: "decision_code_mismatch",
            _count: { _all: 10 },
          },
        ]),
        findFirst: vi.fn(async () => ({
          createdAt: new Date("2026-07-24T14:00:00.000Z"),
        })),
        findMany,
      },
    };
    const service = new BackofficeInboundWebhooksService(
      prisma as unknown as PrismaService,
      {} as InboundWebhookPayloadEncryptionService,
      {} as InboundWebhookQueueService,
      {} as ProviderConversionDecisionRepository,
      {} as InboundWebhookObservationService,
      {} as InboundConversionAutomationIngestionService,
    );

    const result = await service.getProviderConversionRollout("channel_1", {
      onlyMismatches: false,
      comparisonResult: "mismatches",
      decisionPresence: "with_decision",
      decisionCode: "review_required",
      eventName: "Purchase",
      createdFrom: "2026-07-24T10:30",
      createdUntil: "2026-07-24T11:00",
      limit: 20,
      offset: 40,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          channelId: "channel_1",
          matches: false,
          OR: [
            { legacyDecisionCode: { not: null } },
            { canonicalDecisionCode: { not: null } },
          ],
          AND: [
            {
              OR: [
                { legacyDecisionCode: "review_required" },
                { canonicalDecisionCode: "review_required" },
              ],
            },
          ],
          providerRule: {
            conversionRule: {
              eventName: "Purchase",
            },
          },
          createdAt: expect.any(Object),
        }),
        take: 20,
        skip: 40,
      }),
    );
    expect(result.counts.comparisons).toBe(1_200);
    expect(result.filteredCounts).toEqual({
      comparisons: 7,
      matches: 0,
      mismatches: 7,
    });
    expect(result.pagination).toEqual({
      offset: 40,
      limit: 20,
      total: 7,
      hasPrevious: true,
      hasNext: false,
    });
    expect(result.comparisons[0]?.eventName).toBe("Purchase");
  });

  it("requires the exact channel name before changing the engine", async () => {
    const harness = createHarness();

    await expect(
      harness.service.updateProviderConversionEngineMode(
        "channel_1",
        {
          mode: "canonical",
          confirmation: "comercial",
          acknowledgedComparisonCount: 20,
          acknowledgedMismatchCount: 1,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not allow a direct legacy-to-canonical promotion", async () => {
    const harness = createHarness({ mode: "legacy" });

    await expect(
      harness.service.updateProviderConversionEngineMode(
        "channel_1",
        {
          mode: "canonical",
          confirmation: "Comercial",
          acknowledgedComparisonCount: 20,
          acknowledgedMismatchCount: 1,
        },
        actor,
      ),
    ).rejects.toThrow("Ative o modo shadow antes de promover este canal");

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires real shadow comparisons before canonical promotion", async () => {
    const harness = createHarness({
      mode: "shadow",
      comparisonCount: 0,
      mismatchCount: 0,
    });

    await expect(
      harness.service.updateProviderConversionEngineMode(
        "channel_1",
        {
          mode: "canonical",
          confirmation: "Comercial",
          acknowledgedComparisonCount: 0,
          acknowledgedMismatchCount: 0,
        },
        actor,
      ),
    ).rejects.toThrow("O canal ainda nao possui comparacoes shadow");

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects stale evidence counters during canonical promotion", async () => {
    const harness = createHarness({
      mode: "shadow",
      comparisonCount: 21,
      mismatchCount: 2,
    });

    await expect(
      harness.service.updateProviderConversionEngineMode(
        "channel_1",
        {
          mode: "canonical",
          confirmation: "Comercial",
          acknowledgedComparisonCount: 20,
          acknowledgedMismatchCount: 1,
        },
        actor,
      ),
    ).rejects.toThrow(
      "Os contadores mudaram; atualize a auditoria antes de promover",
    );

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("promotes shadow to canonical with exact evidence and an audit record", async () => {
    const harness = createHarness();

    const result = await harness.service.updateProviderConversionEngineMode(
      "channel_1",
      {
        mode: "canonical",
        confirmation: "Comercial",
        acknowledgedComparisonCount: 20,
        acknowledgedMismatchCount: 1,
      },
      actor,
    );

    expect(harness.mode).toBe("canonical");
    expect(result.channel.mode).toBe("canonical");
    expect(
      harness.transaction.inboundWebhookChannel.update,
    ).toHaveBeenCalledWith({
      where: { id: "channel_1" },
      data: { conversionEngineMode: "canonical" },
    });
    expect(harness.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "provider_conversion.channel_engine_mode.change",
        targetId: "channel_1",
        beforeSummary: {
          mode: "shadow",
          comparisonCount: 20,
          mismatchCount: 1,
        },
        afterSummary: {
          mode: "canonical",
          comparisonCount: 20,
          mismatchCount: 1,
        },
      }),
    });
  });

  it("allows an audited canonical-to-legacy rollback without new evidence", async () => {
    const harness = createHarness({
      mode: "canonical",
      comparisonCount: 20,
      mismatchCount: 1,
    });

    const result = await harness.service.updateProviderConversionEngineMode(
      "channel_1",
      {
        mode: "legacy",
        confirmation: "Comercial",
      },
      actor,
    );

    expect(harness.mode).toBe("legacy");
    expect(result.channel.mode).toBe("legacy");
    expect(harness.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeSummary: expect.objectContaining({ mode: "canonical" }),
        afterSummary: expect.objectContaining({ mode: "legacy" }),
      }),
    });
  });
});
