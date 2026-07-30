import { Prisma, PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "../config/load-env";
import { InboundWebhookPayloadEncryptionService } from "../inbound-webhooks/inbound-webhook-payload-encryption.service";
import {
  auditGupshupPayload,
  type GupshupPayloadSignals,
} from "../inbound-webhooks/providers/gupshup/gupshup-payload-audit";

const DEFAULT_LIMIT = 5_000;
const MAX_LIMIT = 10_000;
const DEFAULT_CANDIDATE_LIMIT = 50;
const MAX_CANDIDATE_LIMIT = 200;
const BATCH_SIZE = 250;

type ParsedArgs = {
  workspace?: string;
  connection?: string;
  actorEmail?: string;
  limit: number;
  candidateLimit: number;
};

type DeliveryCandidate = {
  deliveryId: string;
  receivedAt: string;
  providerEventType: string | null;
  status: string;
  classification: string | null;
  ctwaFieldPaths: string[];
  ctwaValuePaths: string[];
  ctwaLikeFieldPaths: string[];
  referralPaths: string[];
  rootKeys: string[];
  payloadKeys: string[];
};

type MutableReport = {
  scanned: number;
  payloadAvailable: number;
  payloadExpired: number;
  payloadCleared: number;
  decryptionFailed: number;
  invalidJson: number;
  traversalTruncated: number;
  withCtwaField: number;
  withCtwaValue: number;
  withCtwaLikeField: number;
  withReferral: number;
  withAnySignal: number;
  withReferralAndCtwaValue: number;
  withReferralWithoutCtwaValue: number;
  ctwaFieldPaths: Map<string, number>;
  ctwaValuePaths: Map<string, number>;
  ctwaLikeFieldPaths: Map<string, number>;
  referralPaths: Map<string, number>;
  envelopeShapes: Map<string, number>;
  candidates: DeliveryCandidate[];
};

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.workspace || !args.actorEmail) {
    throw new Error(
      [
        "Uso:",
        "pnpm --filter @wpptrack/api gupshup:ctwa-audit --",
        '--workspace "Nome ou slug" --actor-email owner@dominio.com',
        '[--connection "Nome ou id"] [--limit 5000] [--candidate-limit 50]',
      ].join(" "),
    );
  }

  const prisma = new PrismaClient();

  try {
    const actor = await resolveActor(prisma, args.actorEmail);
    const workspace = await resolveWorkspace(prisma, args.workspace);
    const connections = await resolveConnections(
      prisma,
      workspace.id,
      args.connection,
    );
    const connectionIds = connections.map((connection) => connection.id);
    const where: Prisma.InboundWebhookDeliveryWhereInput = {
      workspaceId: workspace.id,
      provider: "gupshup",
      connectionId: { in: connectionIds },
    };
    const matchingDeliveries = await prisma.inboundWebhookDelivery.count({
      where,
    });
    const report = emptyReport();
    const encryption = new InboundWebhookPayloadEncryptionService(process.env);
    const now = new Date();
    let cursorId: string | undefined;

    while (
      report.scanned < args.limit &&
      report.scanned < matchingDeliveries
    ) {
      const batch = await prisma.inboundWebhookDelivery.findMany({
        where,
        orderBy: [{ lastReceivedAt: "desc" }, { id: "desc" }],
        take: Math.min(BATCH_SIZE, args.limit - report.scanned),
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        select: {
          id: true,
          workspaceId: true,
          connectionId: true,
          providerEventType: true,
          status: true,
          classification: true,
          lastReceivedAt: true,
          encryptedPayload: true,
          payloadIv: true,
          payloadTag: true,
          encryptionKeyVersion: true,
          payloadExpiresAt: true,
        },
      });

      if (batch.length === 0) {
        break;
      }

      for (const delivery of batch) {
        report.scanned += 1;

        if (delivery.payloadExpiresAt.getTime() <= now.getTime()) {
          report.payloadExpired += 1;
          continue;
        }

        if (
          !delivery.encryptedPayload ||
          !delivery.payloadIv ||
          !delivery.payloadTag ||
          !delivery.encryptionKeyVersion
        ) {
          report.payloadCleared += 1;
          continue;
        }

        let decrypted: Buffer;

        try {
          decrypted = encryption.decrypt(
            {
              encryptedPayload: delivery.encryptedPayload,
              payloadIv: delivery.payloadIv,
              payloadTag: delivery.payloadTag,
              encryptionKeyVersion: delivery.encryptionKeyVersion,
            },
            {
              workspaceId: delivery.workspaceId,
              connectionId: delivery.connectionId,
              deliveryId: delivery.id,
            },
          );
          report.payloadAvailable += 1;
        } catch {
          report.decryptionFailed += 1;
          continue;
        }

        let payload: unknown;

        try {
          payload = JSON.parse(decrypted.toString("utf8"));
        } catch {
          report.invalidJson += 1;
          continue;
        }

        const signals = auditGupshupPayload(payload);
        collectSignals(report, signals);

        if (
          report.candidates.length < args.candidateLimit &&
          (signals.ctwaFieldPaths.length > 0 ||
            signals.ctwaLikeFieldPaths.length > 0 ||
            signals.referralPaths.length > 0)
        ) {
          report.candidates.push({
            deliveryId: delivery.id,
            receivedAt: delivery.lastReceivedAt.toISOString(),
            providerEventType: delivery.providerEventType,
            status: delivery.status,
            classification: delivery.classification,
            ctwaFieldPaths: signals.ctwaFieldPaths,
            ctwaValuePaths: signals.ctwaValuePaths,
            ctwaLikeFieldPaths: signals.ctwaLikeFieldPaths,
            referralPaths: signals.referralPaths,
            rootKeys: signals.rootKeys,
            payloadKeys: signals.payloadKeys,
          });
        }
      }

      cursorId = batch.at(-1)!.id;
    }

    const auditSummary = {
      provider: "gupshup",
      connectionCount: connections.length,
      matchingDeliveries,
      scanned: report.scanned,
      withCtwaValue: report.withCtwaValue,
      withReferral: report.withReferral,
      decryptionFailed: report.decryptionFailed,
      replayTriggered: false,
      metaEventsCreated: false,
    } satisfies Prisma.InputJsonObject;

    await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: actor.id,
        actorType: "platform_owner",
        action: "inbound_webhook.gupshup_ctwa.audit",
        targetType: "Workspace",
        targetId: workspace.id,
        reason: "Automated retained payload signal audit",
        resultStatus: "success",
        afterSummary: auditSummary,
      },
    });

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope: {
            workspace: {
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
            },
            connections: connections.map((connection) => ({
              id: connection.id,
              displayName: connection.displayName,
            })),
            provider: "gupshup",
          },
          safety: {
            operationalDataMutated: false,
            replayTriggered: false,
            metaEventsCreated: false,
            sensitiveValuesIncluded: false,
            auditRecordCreated: true,
          },
          deliveries: {
            matching: matchingDeliveries,
            scanLimit: args.limit,
            scanned: report.scanned,
            notScanned: Math.max(0, matchingDeliveries - report.scanned),
            payloadAvailable: report.payloadAvailable,
            payloadExpired: report.payloadExpired,
            payloadCleared: report.payloadCleared,
            decryptionFailed: report.decryptionFailed,
            invalidJson: report.invalidJson,
            traversalTruncated: report.traversalTruncated,
          },
          signals: {
            withCtwaField: report.withCtwaField,
            withCtwaValue: report.withCtwaValue,
            withCtwaLikeField: report.withCtwaLikeField,
            withReferral: report.withReferral,
            withReferralAndCtwaValue: report.withReferralAndCtwaValue,
            withReferralWithoutCtwaValue:
              report.withReferralWithoutCtwaValue,
          },
          paths: {
            ctwaFields: rankedPaths(report.ctwaFieldPaths),
            ctwaValues: rankedPaths(report.ctwaValuePaths),
            ctwaLikeFields: rankedPaths(report.ctwaLikeFieldPaths),
            referrals: rankedPaths(report.referralPaths),
          },
          envelopeShapes: ranked(report.envelopeShapes, 20).map(
            ({ value, occurrences }) => ({
              shape: JSON.parse(value),
              occurrences,
            }),
          ),
          candidates: {
            totalFound: report.withAnySignal,
            displayed: report.candidates.length,
            limit: args.candidateLimit,
            items: report.candidates,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

function collectSignals(
  report: MutableReport,
  signals: Readonly<GupshupPayloadSignals>,
): void {
  const hasCtwaValue = signals.ctwaValuePaths.length > 0;
  const hasReferral = signals.referralPaths.length > 0;

  if (
    signals.ctwaFieldPaths.length > 0 ||
    signals.ctwaLikeFieldPaths.length > 0 ||
    hasReferral
  ) {
    report.withAnySignal += 1;
  }

  if (signals.ctwaFieldPaths.length > 0) {
    report.withCtwaField += 1;
  }

  if (hasCtwaValue) {
    report.withCtwaValue += 1;
  }

  if (signals.ctwaLikeFieldPaths.length > 0) {
    report.withCtwaLikeField += 1;
  }

  if (hasReferral) {
    report.withReferral += 1;
  }

  if (hasReferral && hasCtwaValue) {
    report.withReferralAndCtwaValue += 1;
  } else if (hasReferral) {
    report.withReferralWithoutCtwaValue += 1;
  }

  if (signals.truncated) {
    report.traversalTruncated += 1;
  }

  incrementAll(report.ctwaFieldPaths, signals.ctwaFieldPaths);
  incrementAll(report.ctwaValuePaths, signals.ctwaValuePaths);
  incrementAll(report.ctwaLikeFieldPaths, signals.ctwaLikeFieldPaths);
  incrementAll(report.referralPaths, signals.referralPaths);
  increment(
    report.envelopeShapes,
    JSON.stringify({
      rootKeys: signals.rootKeys,
      payloadKeys: signals.payloadKeys,
    }),
  );
}

function emptyReport(): MutableReport {
  return {
    scanned: 0,
    payloadAvailable: 0,
    payloadExpired: 0,
    payloadCleared: 0,
    decryptionFailed: 0,
    invalidJson: 0,
    traversalTruncated: 0,
    withCtwaField: 0,
    withCtwaValue: 0,
    withCtwaLikeField: 0,
    withReferral: 0,
    withAnySignal: 0,
    withReferralAndCtwaValue: 0,
    withReferralWithoutCtwaValue: 0,
    ctwaFieldPaths: new Map(),
    ctwaValuePaths: new Map(),
    ctwaLikeFieldPaths: new Map(),
    referralPaths: new Map(),
    envelopeShapes: new Map(),
    candidates: [],
  };
}

async function resolveActor(prisma: PrismaClient, email: string) {
  const actor = await prisma.user.findFirst({
    where: {
      email: { equals: email.trim(), mode: "insensitive" },
      platformRole: "platform_owner",
    },
    select: { id: true },
  });

  if (!actor) {
    throw new Error(
      "O e-mail informado nao pertence a um Platform Owner ativo.",
    );
  }

  return actor;
}

async function resolveWorkspace(prisma: PrismaClient, reference: string) {
  const normalized = reference.trim();
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { id: normalized },
        { slug: normalized },
        { name: { equals: normalized, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, slug: true },
    take: 2,
  });

  if (workspaces.length !== 1) {
    throw new Error(
      workspaces.length === 0
        ? "Workspace nao encontrado."
        : "A referencia do workspace e ambigua; use o id ou slug.",
    );
  }

  return workspaces[0]!;
}

async function resolveConnections(
  prisma: PrismaClient,
  workspaceId: string,
  reference?: string,
) {
  const normalized = reference?.trim();
  const connections = await prisma.inboundWebhookConnection.findMany({
    where: {
      workspaceId,
      provider: "gupshup",
      removedAt: null,
      ...(normalized
        ? {
            OR: [
              { id: normalized },
              {
                displayName: {
                  equals: normalized,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
    select: { id: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });

  if (connections.length === 0) {
    throw new Error("Nenhuma conexao Gupshup correspondente foi encontrada.");
  }

  if (normalized && connections.length !== 1) {
    throw new Error("A referencia da conexao e ambigua; use o id.");
  }

  return connections;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    limit: DEFAULT_LIMIT,
    candidateLimit: DEFAULT_CANDIDATE_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      continue;
    }

    if (key === "--workspace") {
      parsed.workspace = value;
      index += 1;
      continue;
    }

    if (key === "--connection") {
      parsed.connection = value;
      index += 1;
      continue;
    }

    if (key === "--actor-email") {
      parsed.actorEmail = value;
      index += 1;
      continue;
    }

    if (key === "--limit") {
      parsed.limit = parseBoundedInteger(value, "--limit", MAX_LIMIT);
      index += 1;
      continue;
    }

    if (key === "--candidate-limit") {
      parsed.candidateLimit = parseBoundedInteger(
        value,
        "--candidate-limit",
        MAX_CANDIDATE_LIMIT,
      );
      index += 1;
    }
  }

  return parsed;
}

function parseBoundedInteger(
  value: string,
  argument: string,
  maximum: number,
): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(
      `${argument} deve ser um inteiro entre 1 e ${maximum}.`,
    );
  }

  return parsed;
}

function incrementAll(
  target: Map<string, number>,
  values: readonly string[],
): void {
  for (const value of values) {
    increment(target, value);
  }
}

function increment(target: Map<string, number>, value: string): void {
  target.set(value, (target.get(value) ?? 0) + 1);
}

function ranked(
  values: ReadonlyMap<string, number>,
  limit = 50,
): Array<{ value: string; occurrences: number }> {
  return [...values.entries()]
    .sort(
      ([leftValue, leftCount], [rightValue, rightCount]) =>
        rightCount - leftCount || leftValue.localeCompare(rightValue),
    )
    .slice(0, limit)
    .map(([value, occurrences]) => ({ value, occurrences }));
}

function rankedPaths(
  values: ReadonlyMap<string, number>,
): Array<{ path: string; occurrences: number }> {
  return ranked(values).map(({ value, occurrences }) => ({
    path: value,
    occurrences,
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
