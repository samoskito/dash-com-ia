import { describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../src/common/runtime/runtime.module";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { InboundWebhookDiagnosticsService } from "../src/inbound-webhooks/inbound-webhook-diagnostics.service";
import {
  INBOUND_WEBHOOK_RECOVERY_CLAIM_TTL_MS,
  INBOUND_WEBHOOK_RECOVERY_GRACE_MS,
  InboundWebhookMaintenanceService,
} from "../src/inbound-webhooks/inbound-webhook-maintenance.service";
import type { InboundWebhookQueueService } from "../src/inbound-webhooks/inbound-webhook-queue.service";
import type { InboundWebhookProductionIntakeService } from "../src/inbound-webhooks/inbound-webhook-production-intake.service";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";

type MutableRecord = Record<string, any>;

const now = new Date("2026-07-17T21:00:00.000Z");
const oldEnoughForRecovery = new Date(
  now.getTime() - INBOUND_WEBHOOK_RECOVERY_GRACE_MS - 1,
);
const livePayloadExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
const secretHashMarker = "secret_hash_that_must_never_leave_the_connection";

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (
    expected === null ||
    typeof expected !== "object" ||
    expected instanceof Date
  ) {
    return comparable(actual) === comparable(expected);
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => matchesValue(actual[index], value))
    );
  }

  const comparison = expected as MutableRecord;
  let hasComparison = false;
  let result = true;

  if ("in" in comparison) {
    hasComparison = true;
    result =
      result &&
      comparison.in.some(
        (candidate: unknown) => comparable(candidate) === comparable(actual),
      );
  }

  if ("not" in comparison) {
    hasComparison = true;
    result = result && !matchesValue(actual, comparison.not);
  }

  if ("lte" in comparison) {
    hasComparison = true;
    result =
      result &&
      Number(comparable(actual)) <= Number(comparable(comparison.lte));
  }

  if ("lt" in comparison) {
    hasComparison = true;
    result =
      result && Number(comparable(actual)) < Number(comparable(comparison.lt));
  }

  if ("gte" in comparison) {
    hasComparison = true;
    result =
      result &&
      Number(comparable(actual)) >= Number(comparable(comparison.gte));
  }

  if ("gt" in comparison) {
    hasComparison = true;
    result =
      result && Number(comparable(actual)) > Number(comparable(comparison.gt));
  }

  return hasComparison
    ? result
    : matchesRecord(actual as MutableRecord, comparison);
}

function matchesRecord(
  record: MutableRecord | null | undefined,
  where: MutableRecord,
): boolean {
  if (!record) {
    return false;
  }

  for (const [field, expected] of Object.entries(where)) {
    if (field === "OR") {
      if (
        !(expected as MutableRecord[]).some((condition) =>
          matchesRecord(record, condition),
        )
      ) {
        return false;
      }
      continue;
    }

    if (field === "AND") {
      if (
        !(expected as MutableRecord[]).every((condition) =>
          matchesRecord(record, condition),
        )
      ) {
        return false;
      }
      continue;
    }

    if (!matchesValue(record[field], expected)) {
      return false;
    }
  }

  return true;
}

function selectRecord(
  record: MutableRecord,
  select: MutableRecord | undefined,
): MutableRecord {
  if (!select) {
    return { ...record };
  }

  return Object.fromEntries(
    Object.entries(select).map(([field, selection]) => {
      if (selection === true) {
        return [field, record[field]];
      }

      const nested = selection as MutableRecord;
      return [
        field,
        selectRecord(record[field] as MutableRecord, nested.select),
      ];
    }),
  );
}

function createHarness() {
  const deliveries = new Map<string, MutableRecord>();
  const connections = new Map<string, MutableRecord>();

  const addConnection = (
    id: string,
    overrides: MutableRecord = {},
  ): MutableRecord => {
    const parserRelease = {
      provider: "umbler",
      version: "v1",
      status: "observation_only",
      ...(overrides.parserRelease ?? {}),
    };
    const connection = {
      id,
      workspaceId: "workspace_1",
      status: "observation",
      removedAt: null,
      secretHash: secretHashMarker,
      ...overrides,
      parserRelease,
    };
    connections.set(id, connection);
    return connection;
  };

  addConnection("connection_1");

  const addDelivery = (
    id: string,
    overrides: MutableRecord = {},
  ): MutableRecord => {
    const connectionId = overrides.connectionId ?? "connection_1";
    const connection = connections.get(connectionId);

    if (!connection) {
      throw new Error("Test connection is missing");
    }

    const delivery = {
      id,
      workspaceId: connection.workspaceId,
      connectionId,
      provider: "umbler",
      ingressKey: `ingress_${id}`,
      externalDeliveryId: `external_${id}`,
      providerEventType: "Message",
      parserVersion: connection.parserRelease.version,
      status: "pending",
      classification: null,
      firstReceivedAt: oldEnoughForRecovery,
      lastReceivedAt: oldEnoughForRecovery,
      attemptCount: 1,
      encryptedPayload: `ciphertext_private_${id}`,
      payloadIv: `iv_private_${id}`,
      payloadTag: `tag_private_${id}`,
      encryptionKeyVersion: 7,
      payloadExpiresAt: livePayloadExpiry,
      normalizedSummary: {
        identitySource: "provider_event_id",
        retainedMetadata: id,
      },
      parseErrorCode: null,
      routingErrorCode: null,
      queuedAt: null,
      processedAt: null,
      createdAt: oldEnoughForRecovery,
      updatedAt: oldEnoughForRecovery,
      ...overrides,
    };
    deliveries.set(id, delivery);
    return delivery;
  };

  const inboundWebhookDelivery = {
    findMany: vi.fn(
      async ({
        where,
        select,
        orderBy,
        take,
      }: {
        where: MutableRecord;
        select?: MutableRecord;
        orderBy?: MutableRecord[];
        take?: number;
      }) => {
        const records: MutableRecord[] = [...deliveries.values()]
          .map((delivery) => ({
            ...delivery,
            connection: connections.get(delivery.connectionId),
          }))
          .filter((delivery) => matchesRecord(delivery, where));

        for (const ordering of [...(orderBy ?? [])].reverse()) {
          const [field, direction] = Object.entries(ordering)[0]!;
          records.sort((left, right) => {
            const comparison =
              comparable(left[field])! < comparable(right[field])! ? -1 : 1;
            return direction === "desc" ? -comparison : comparison;
          });
        }

        return records
          .slice(0, take ?? records.length)
          .map((record) => selectRecord(record, select));
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: MutableRecord;
        data: MutableRecord;
      }) => {
        let count = 0;

        for (const delivery of deliveries.values()) {
          const record = {
            ...delivery,
            connection: connections.get(delivery.connectionId),
          };

          if (!matchesRecord(record, where)) {
            continue;
          }

          for (const [field, value] of Object.entries(data)) {
            delivery[field] =
              value &&
              typeof value === "object" &&
              "increment" in (value as MutableRecord)
                ? delivery[field] + (value as MutableRecord).increment
                : value;
          }
          count += 1;
        }

        return { count };
      },
    ),
  };
  const prisma = {
    inboundWebhookDelivery,
  };
  const queue = {
    enqueueDelivery: vi.fn(
      async (
        input: Parameters<InboundWebhookQueueService["enqueueDelivery"]>[0],
      ) => ({
        jobId: `inbound-webhook_${input.deliveryId}`,
        status: "queued" as const,
      }),
    ),
  };
  const diagnostics = {
    recordMaintenance: vi.fn(
      async (
        _input: Parameters<
          InboundWebhookDiagnosticsService["recordMaintenance"]
        >[0],
      ) => undefined,
    ),
  };
  const env: RuntimeEnv = {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 47).toString("base64"),
  };
  const parserRegistry = new InboundWebhookParserRegistry();
  const productionIntake = {
    recoverPendingItems: vi.fn(async () => ({
      eligible: 0,
      persisted: 0,
      queued: 0,
      existing: 0,
      queueFailures: 0,
      providerEligible: 0,
      providerQueued: 0,
      providerExisting: 0,
      providerQueueFailures: 0,
    })),
  };
  const createService = () =>
    new InboundWebhookMaintenanceService(
      prisma as unknown as PrismaService,
      env,
      queue as unknown as InboundWebhookQueueService,
      parserRegistry,
      diagnostics as unknown as InboundWebhookDiagnosticsService,
      productionIntake as unknown as InboundWebhookProductionIntakeService,
    );

  return {
    addConnection,
    addDelivery,
    connections,
    createService,
    deliveries,
    diagnostics,
    prisma,
    queue,
    service: createService(),
  };
}

describe("inbound webhook maintenance service", () => {
  it("physically clears all four expired encrypted fields while preserving metadata and a live payload", async () => {
    const harness = createHarness();
    const processedAt = new Date("2026-07-17T20:30:00.000Z");
    const expired = harness.addDelivery("delivery_expired", {
      status: "processed",
      classification: "ignored_no_ctwa",
      payloadExpiresAt: new Date(now.getTime() - 1),
      processedAt,
      parseErrorCode: "retained_parse_code",
      routingErrorCode: "retained_route_code",
    });
    const live = harness.addDelivery("delivery_live", {
      status: "processed",
      payloadExpiresAt: new Date(now.getTime() + 1),
    });
    const expiredMetadata = {
      ingressKey: expired.ingressKey,
      externalDeliveryId: expired.externalDeliveryId,
      providerEventType: expired.providerEventType,
      parserVersion: expired.parserVersion,
      status: expired.status,
      classification: expired.classification,
      normalizedSummary: expired.normalizedSummary,
      parseErrorCode: expired.parseErrorCode,
      routingErrorCode: expired.routingErrorCode,
      processedAt: expired.processedAt,
      attemptCount: expired.attemptCount,
    };
    const liveEncryptedFields = {
      encryptedPayload: live.encryptedPayload,
      payloadIv: live.payloadIv,
      payloadTag: live.payloadTag,
      encryptionKeyVersion: live.encryptionKeyVersion,
    };

    const result = await harness.service.runMaintenance(now);

    expect(result).toMatchObject({
      enabled: true,
      payloadsCleared: 1,
      unavailableMarked: 0,
      recoveryCandidates: 0,
    });
    expect(expired).toMatchObject({
      ...expiredMetadata,
      encryptedPayload: null,
      payloadIv: null,
      payloadTag: null,
      encryptionKeyVersion: null,
    });
    expect(live).toMatchObject(liveEncryptedFields);
    expect(harness.deliveries).toHaveLength(2);
    expect(harness.diagnostics.recordMaintenance).not.toHaveBeenCalled();
  });

  it("marks an expired pending delivery unavailable after clearing its raw payload", async () => {
    const harness = createHarness();
    const delivery = harness.addDelivery("delivery_expired_pending", {
      payloadExpiresAt: new Date(now.getTime() - 1),
    });

    const result = await harness.service.runMaintenance(now);

    expect(result).toMatchObject({
      payloadsCleared: 1,
      unavailableMarked: 1,
      recoveryCandidates: 0,
    });
    expect(delivery).toMatchObject({
      status: "failed",
      classification: "invalid_payload",
      parseErrorCode: "inbound_webhook_payload_unavailable",
      processedAt: now,
      encryptedPayload: null,
      payloadIv: null,
      payloadTag: null,
      encryptionKeyVersion: null,
    });
    expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
    expect(harness.diagnostics.recordMaintenance).toHaveBeenCalledOnce();
    expect(
      harness.diagnostics.recordMaintenance.mock.calls[0][0],
    ).toMatchObject({
      workspaceId: "workspace_1",
      status: "requires_review",
      errorCode: "inbound_webhook_payload_unavailable",
      deliveryId: "delivery_expired_pending",
      connectionId: "connection_1",
      operation: "payload_retention",
    });
  });

  it("claims an old pending delivery and enqueues it only once", async () => {
    const harness = createHarness();
    const delivery = harness.addDelivery("delivery_pending");

    const first = await harness.service.runMaintenance(now);
    const second = await harness.service.runMaintenance(
      new Date(now.getTime() + 1_000),
    );

    expect(first).toMatchObject({
      recoveryCandidates: 1,
      recoveryClaims: 1,
      enqueued: 1,
      existingJobs: 0,
      queueFailures: 0,
    });
    expect(second).toMatchObject({
      recoveryCandidates: 0,
      recoveryClaims: 0,
      enqueued: 0,
    });
    expect(delivery).toMatchObject({
      status: "queued",
      queuedAt: now,
      processedAt: null,
    });
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledOnce();
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledWith({
      deliveryId: "delivery_pending",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    });

    const claim = harness.prisma.inboundWebhookDelivery.updateMany.mock.calls
      .map(([input]) => input)
      .find(
        (input) =>
          input.data.queuedAt instanceof Date &&
          input.data.status === undefined,
      );
    expect(claim).toMatchObject({
      where: {
        id: "delivery_pending",
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        status: "pending",
        queuedAt: null,
        connection: {
          status: { in: ["observation", "production"] },
          removedAt: null,
        },
      },
      data: {
        queuedAt: now,
      },
    });
  });

  it("allows only one replica to win the database claim and enqueue", async () => {
    const harness = createHarness();
    const delivery = harness.addDelivery("delivery_race");
    const replicaA = harness.service;
    const replicaB = harness.createService();

    const results = await Promise.all([
      replicaA.runMaintenance(now),
      replicaB.runMaintenance(now),
    ]);

    expect(
      results.reduce((total, result) => total + result.recoveryCandidates, 0),
    ).toBe(2);
    expect(
      results.reduce((total, result) => total + result.recoveryClaims, 0),
    ).toBe(1);
    expect(results.reduce((total, result) => total + result.enqueued, 0)).toBe(
      1,
    );
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledOnce();
    expect(delivery).toMatchObject({
      status: "queued",
      queuedAt: now,
    });
  });

  it("does not duplicate queued or processed work and skips paused or removed connections", async () => {
    const harness = createHarness();
    harness.addConnection("connection_paused", {
      status: "paused",
    });
    harness.addConnection("connection_removed", {
      removedAt: new Date("2026-07-17T20:00:00.000Z"),
    });
    const queued = harness.addDelivery("delivery_queued", {
      status: "queued",
    });
    const processed = harness.addDelivery("delivery_processed", {
      status: "processed",
      processedAt: new Date("2026-07-17T20:00:00.000Z"),
    });
    const paused = harness.addDelivery("delivery_paused", {
      connectionId: "connection_paused",
    });
    const removed = harness.addDelivery("delivery_removed", {
      connectionId: "connection_removed",
    });

    const result = await harness.service.runMaintenance(now);

    expect(result).toMatchObject({
      recoveryCandidates: 0,
      recoveryClaims: 0,
      enqueued: 0,
      existingJobs: 0,
    });
    expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
    expect(queued.status).toBe("queued");
    expect(processed.status).toBe("processed");
    expect(paused.status).toBe("pending");
    expect(removed.status).toBe("pending");
  });

  it.each([
    {
      label: "missing",
      parserVersion: "v404",
      releaseStatus: "observation_only",
      expectedCode: "inbound_webhook_parser_not_found",
    },
    {
      label: "retired",
      parserVersion: "v1",
      releaseStatus: "retired",
      expectedCode: "inbound_webhook_parser_retired",
    },
  ])(
    "marks a $label parser as a redacted failure requiring review",
    async ({ parserVersion, releaseStatus, expectedCode }) => {
      const harness = createHarness();
      const connection = harness.connections.get("connection_1")!;
      connection.parserRelease.version = parserVersion;
      connection.parserRelease.status = releaseStatus;
      const delivery = harness.addDelivery("delivery_parser_failure", {
        parserVersion,
        encryptedPayload: "ciphertext_parser_private_marker",
        payloadIv: "iv_parser_private_marker",
        payloadTag: "tag_parser_private_marker",
      });

      const result = await harness.service.runMaintenance(now);

      expect(result).toMatchObject({
        recoveryCandidates: 1,
        recoveryClaims: 0,
        enqueued: 0,
        parserFailures: 1,
      });
      expect(delivery).toMatchObject({
        status: "failed",
        classification: null,
        parseErrorCode: expectedCode,
        processedAt: now,
      });
      expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
      expect(harness.diagnostics.recordMaintenance).toHaveBeenCalledOnce();

      const diagnostic = harness.diagnostics.recordMaintenance.mock.calls[0][0];
      expect(diagnostic).toMatchObject({
        workspaceId: "workspace_1",
        severity: "warning",
        status: "requires_review",
        errorCode: expectedCode,
        deliveryId: "delivery_parser_failure",
        connectionId: "connection_1",
        operation: "parser_recovery",
      });

      const serializedDiagnostic = JSON.stringify(diagnostic);
      for (const forbidden of [
        "ciphertext_parser_private_marker",
        "iv_parser_private_marker",
        "tag_parser_private_marker",
        secretHashMarker,
      ]) {
        expect(serializedDiagnostic).not.toContain(forbidden);
      }
    },
  );

  it("keeps queue failures recoverable without duplicating the redacted diagnostic", async () => {
    const harness = createHarness();
    const queueErrorMarker =
      "redis failure with raw_payload_marker and secret_value_marker";
    const delivery = harness.addDelivery("delivery_queue_failure", {
      encryptedPayload: "ciphertext_queue_private_marker",
      payloadIv: "iv_queue_private_marker",
      payloadTag: "tag_queue_private_marker",
    });
    harness.queue.enqueueDelivery
      .mockRejectedValueOnce(new Error(queueErrorMarker))
      .mockRejectedValueOnce(new Error(queueErrorMarker));

    const failedRun = await harness.service.runMaintenance(now);

    expect(failedRun).toMatchObject({
      recoveryCandidates: 1,
      recoveryClaims: 1,
      enqueued: 0,
      queueFailures: 1,
    });
    expect(delivery).toMatchObject({
      status: "pending",
      queuedAt: now,
      parseErrorCode: null,
      processedAt: null,
    });
    expect(harness.diagnostics.recordMaintenance).toHaveBeenCalledOnce();

    const diagnostic = harness.diagnostics.recordMaintenance.mock.calls[0][0];
    expect(diagnostic).toMatchObject({
      workspaceId: "workspace_1",
      severity: "warning",
      status: "requires_review",
      errorCode: "inbound_webhook_recovery_enqueue_failed",
      deliveryId: "delivery_queue_failure",
      connectionId: "connection_1",
      operation: "queue_recovery",
    });

    const serializedDiagnostic = JSON.stringify(diagnostic);
    for (const forbidden of [
      queueErrorMarker,
      "raw_payload_marker",
      "secret_value_marker",
      "ciphertext_queue_private_marker",
      "iv_queue_private_marker",
      "tag_queue_private_marker",
      secretHashMarker,
    ]) {
      expect(serializedDiagnostic).not.toContain(forbidden);
    }

    const retriedAt = new Date(
      now.getTime() + INBOUND_WEBHOOK_RECOVERY_CLAIM_TTL_MS + 1,
    );
    const retriedRun = await harness.service.runMaintenance(retriedAt);

    expect(retriedRun).toMatchObject({
      recoveryCandidates: 1,
      recoveryClaims: 1,
      enqueued: 0,
      queueFailures: 1,
    });
    expect(delivery).toMatchObject({
      status: "pending",
      queuedAt: retriedAt,
    });
    expect(harness.diagnostics.recordMaintenance).toHaveBeenCalledOnce();

    const recoveredAt = new Date(
      retriedAt.getTime() + INBOUND_WEBHOOK_RECOVERY_CLAIM_TTL_MS + 1,
    );
    const recoveredRun = await harness.service.runMaintenance(recoveredAt);

    expect(recoveredRun).toMatchObject({
      recoveryCandidates: 1,
      recoveryClaims: 1,
      enqueued: 1,
      queueFailures: 0,
    });
    expect(delivery).toMatchObject({
      status: "queued",
      queuedAt: recoveredAt,
      parseErrorCode: null,
      processedAt: null,
    });
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledTimes(3);

    const queuePayloads = harness.queue.enqueueDelivery.mock.calls.map(
      ([input]) => input,
    );
    expect(queuePayloads).toEqual([
      {
        deliveryId: "delivery_queue_failure",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
      },
      {
        deliveryId: "delivery_queue_failure",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
      },
      {
        deliveryId: "delivery_queue_failure",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
      },
    ]);
  });
});
