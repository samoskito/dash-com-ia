import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import type {
  PersistedProviderConversionDecision,
  ProviderConversionDecisionRepository,
} from "../src/conversion-rules/provider-conversion-decision.repository";
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
const requestKey = "backoffice:decision_1:request_123456";

function persistedDecision(input: {
  id: string;
  version: number;
  evaluationKey: string;
  supersedesDecisionId: string | null;
}): PersistedProviderConversionDecision {
  return {
    id: input.id,
    workspaceId: "workspace_1",
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_1",
    channelId: "channel_1",
    leadId: "lead_1",
    evaluationKey: input.evaluationKey,
    decisionFingerprint: `fingerprint_${input.version}`,
    decisionVersion: input.version,
    supersedesDecisionId: input.supersedesDecisionId,
    decisionCode: "review_required",
    reasonCode: "catalog_combination_unknown",
    eventName: "Purchase",
    occurredAt: new Date("2026-07-23T13:36:00.000Z"),
    occurrenceKey: `sha256:${"a".repeat(64)}`,
    decision: {} as PersistedProviderConversionDecision["decision"],
    createdAt: new Date("2026-07-23T13:37:00.000Z"),
  };
}

function createHarness(latestOverride?: PersistedProviderConversionDecision) {
  const initial = persistedDecision({
    id: "decision_1",
    version: 1,
    evaluationKey: "initial",
    supersedesDecisionId: null,
  });
  let latest = latestOverride ?? initial;
  const audits: Array<Record<string, unknown>> = [];
  const reevaluationEvaluationKey = vi.fn(
    (key: string) => `reevaluation:${key}`,
  );
  const decisions = {
    findLatestByOccurrence: vi.fn(async () => latest),
    reevaluationEvaluationKey,
  };
  const observation = {
    reevaluateProviderConversionDecision: vi.fn(async () => {
      latest = persistedDecision({
        id: "decision_2",
        version: 2,
        evaluationKey: reevaluationEvaluationKey(requestKey),
        supersedesDecisionId: initial.id,
      });
      return {
        executionIds: ["execution_1"],
        eligibleExecutionIds: ["execution_1"],
      };
    }),
  };
  const prisma = {
    providerConversionDecisionAudit: {
      findUnique: vi.fn(async () => ({
        id: initial.id,
        workspaceId: initial.workspaceId,
        providerRuleId: initial.providerRuleId,
        occurrenceKey: initial.occurrenceKey,
        evaluationKey: initial.evaluationKey,
        decisionVersion: initial.decisionVersion,
        decisionCode: initial.decisionCode,
        sourceDelivery: {
          id: "delivery_1",
          connectionId: "connection_1",
          purpose: "message_observation",
          status: "processed",
          payloadExpiresAt: new Date(Date.now() + 60_000),
          encryptedPayload: Buffer.from("encrypted"),
          payloadIv: Buffer.from("iv"),
          payloadTag: Buffer.from("tag"),
          encryptionKeyVersion: 1,
        },
      })),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return { id: "audit_1", ...data };
      }),
    },
  };
  const service = new BackofficeInboundWebhooksService(
    prisma as unknown as PrismaService,
    {} as InboundWebhookPayloadEncryptionService,
    {} as InboundWebhookQueueService,
    decisions as unknown as ProviderConversionDecisionRepository,
    observation as unknown as InboundWebhookObservationService,
    {} as InboundConversionAutomationIngestionService,
  );

  return { audits, decisions, observation, service };
}

describe("backoffice provider conversion reevaluation", () => {
  it("creates and audits one exact successor decision", async () => {
    const harness = createHarness();

    const result =
      await harness.service.reevaluateProviderConversionDecision(
        "decision_1",
        requestKey,
        actor,
      );

    expect(result).toEqual({
      previousDecisionId: "decision_1",
      decisionId: "decision_2",
      decisionVersion: 2,
      status: "reevaluated",
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });
    expect(
      harness.observation.reevaluateProviderConversionDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "delivery_1",
        providerRuleId: "provider_rule_1",
        occurrenceKey: `sha256:${"a".repeat(64)}`,
        requestKey,
      }),
    );
    expect(harness.audits[0]).toMatchObject({
      action: "provider_conversion.decision.reevaluate",
      targetId: "decision_2",
      resultStatus: "completed",
    });
  });

  it("returns an existing reevaluation for the same idempotency key", async () => {
    const existing = persistedDecision({
      id: "decision_2",
      version: 2,
      evaluationKey: `reevaluation:${requestKey}`,
      supersedesDecisionId: "decision_1",
    });
    const harness = createHarness(existing);

    const result =
      await harness.service.reevaluateProviderConversionDecision(
        "decision_1",
        requestKey,
        actor,
      );

    expect(result.status).toBe("existing");
    expect(result.decisionId).toBe("decision_2");
    expect(
      harness.observation.reevaluateProviderConversionDecision,
    ).not.toHaveBeenCalled();
  });

  it("rejects a stale screen with a different reevaluation key", async () => {
    const newer = persistedDecision({
      id: "decision_2",
      version: 2,
      evaluationKey: "reevaluation:another_request",
      supersedesDecisionId: "decision_1",
    });
    const harness = createHarness(newer);

    await expect(
      harness.service.reevaluateProviderConversionDecision(
        "decision_1",
        requestKey,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      harness.observation.reevaluateProviderConversionDecision,
    ).not.toHaveBeenCalled();
  });
});
