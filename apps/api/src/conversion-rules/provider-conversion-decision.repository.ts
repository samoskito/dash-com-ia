import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ProviderConversionDecisionAudit } from "@prisma/client";
import {
  providerConversionDecisionSchema,
  type ProviderConversionDecisionDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

const INITIAL_EVALUATION_KEY = "initial";

export type PersistedProviderConversionDecision = {
  id: string;
  workspaceId: string;
  providerRuleId: string;
  sourceDeliveryId: string;
  channelId: string | null;
  leadId: string | null;
  evaluationKey: string;
  decisionFingerprint: string;
  decisionVersion: number;
  supersedesDecisionId: string | null;
  decisionCode: ProviderConversionDecisionDto["decisionCode"];
  reasonCode: string;
  eventName: ProviderConversionDecisionDto["occurrence"]["eventName"];
  occurredAt: Date;
  occurrenceKey: string;
  decision: ProviderConversionDecisionDto;
  createdAt: Date;
};

export type RecordInitialProviderConversionDecisionInput = {
  decision: ProviderConversionDecisionDto;
  sourceDeliveryId: string;
};

export type AppendProviderConversionReevaluationInput = {
  decision: ProviderConversionDecisionDto;
  sourceDeliveryId: string;
  supersedesDecisionId: string;
  reevaluationRequestKey: string;
};

export type PersistProviderConversionDecisionResult =
  PersistedProviderConversionDecision & { created: boolean };

export type ProviderConversionDecisionPersistenceErrorCode =
  | "evaluation_key_conflict"
  | "implicit_reevaluation_not_allowed"
  | "invalid_persistence_input"
  | "invalid_reevaluation_request"
  | "stale_superseded_decision";

export class ProviderConversionDecisionPersistenceError extends Error {
  constructor(
    readonly code: ProviderConversionDecisionPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderConversionDecisionPersistenceError";
  }
}

@Injectable()
export class ProviderConversionDecisionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordInitial(
    input: RecordInitialProviderConversionDecisionInput,
  ): Promise<PersistProviderConversionDecisionResult> {
    return this.persist({
      decision: input.decision,
      sourceDeliveryId: input.sourceDeliveryId,
      evaluationKey: INITIAL_EVALUATION_KEY,
      supersedesDecisionId: null,
      reevaluation: false,
    });
  }

  async appendReevaluation(
    input: AppendProviderConversionReevaluationInput,
  ): Promise<PersistProviderConversionDecisionResult> {
    const requestKey = this.requiredIdentifier(
      input.reevaluationRequestKey,
      "reevaluationRequestKey",
    );

    return this.persist({
      decision: input.decision,
      sourceDeliveryId: input.sourceDeliveryId,
      evaluationKey: `reevaluation:${this.hash(requestKey)}`,
      supersedesDecisionId: this.requiredIdentifier(
        input.supersedesDecisionId,
        "supersedesDecisionId",
      ),
      reevaluation: true,
    });
  }

  private async persist(input: {
    decision: ProviderConversionDecisionDto;
    sourceDeliveryId: string;
    evaluationKey: string;
    supersedesDecisionId: string | null;
    reevaluation: boolean;
  }): Promise<PersistProviderConversionDecisionResult> {
    const decision = providerConversionDecisionSchema.parse(input.decision);
    const decisionFingerprint = this.fingerprint(decision);
    const sourceDeliveryId = this.requiredIdentifier(
      input.sourceDeliveryId,
      "sourceDeliveryId",
    );
    const lock = this.lockKeys(
      decision.occurrence.workspaceId,
      decision.rule.providerRuleId,
      decision.occurrence.occurrenceKey,
    );

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ lockAcquired: string }>>`
        SELECT CAST(
          pg_advisory_xact_lock(
            CAST(${lock.first} AS integer),
            CAST(${lock.second} AS integer)
          ) AS text
        ) AS "lockAcquired"
      `;

      const existing =
        await transaction.providerConversionDecisionAudit.findUnique({
          where: {
            providerRuleId_occurrenceKey_evaluationKey: {
              providerRuleId: decision.rule.providerRuleId,
              occurrenceKey: decision.occurrence.occurrenceKey,
              evaluationKey: input.evaluationKey,
            },
          },
        });
      if (existing) {
        if (existing.decisionFingerprint !== decisionFingerprint) {
          throw new ProviderConversionDecisionPersistenceError(
            "evaluation_key_conflict",
            "The evaluation key already belongs to a different frozen decision",
          );
        }

        return {
          ...this.hydrate(existing),
          created: false,
        };
      }

      const latest =
        await transaction.providerConversionDecisionAudit.findFirst({
          where: {
            workspaceId: decision.occurrence.workspaceId,
            providerRuleId: decision.rule.providerRuleId,
            occurrenceKey: decision.occurrence.occurrenceKey,
          },
          orderBy: { decisionVersion: "desc" },
        });

      this.assertVersionTransition({
        latest,
        reevaluation: input.reevaluation,
        supersedesDecisionId: input.supersedesDecisionId,
      });

      const created = await transaction.providerConversionDecisionAudit.create({
        data: this.createData({
          decision,
          decisionFingerprint,
          evaluationKey: input.evaluationKey,
          sourceDeliveryId,
          decisionVersion: (latest?.decisionVersion ?? 0) + 1,
          supersedesDecisionId: input.supersedesDecisionId,
        }),
      });

      return {
        ...this.hydrate(created),
        created: true,
      };
    });
  }

  async findById(input: {
    workspaceId: string;
    decisionId: string;
  }): Promise<PersistedProviderConversionDecision | null> {
    const record = await this.prisma.providerConversionDecisionAudit.findFirst({
      where: {
        id: input.decisionId,
        workspaceId: input.workspaceId,
      },
    });

    return record ? this.hydrate(record) : null;
  }

  async listVersions(input: {
    workspaceId: string;
    providerRuleId: string;
    occurrenceKey: string;
  }): Promise<PersistedProviderConversionDecision[]> {
    const records = await this.prisma.providerConversionDecisionAudit.findMany({
      where: {
        workspaceId: input.workspaceId,
        providerRuleId: input.providerRuleId,
        occurrenceKey: input.occurrenceKey,
      },
      orderBy: { decisionVersion: "asc" },
    });

    return records.map((record) => this.hydrate(record));
  }

  private createData(input: {
    decision: ProviderConversionDecisionDto;
    sourceDeliveryId: string;
    evaluationKey: string;
    decisionFingerprint: string;
    decisionVersion: number;
    supersedesDecisionId: string | null;
  }): Prisma.ProviderConversionDecisionAuditUncheckedCreateInput {
    const { decision } = input;
    const lead =
      decision.leadResolution.status === "resolved"
        ? decision.leadResolution.lead
        : null;
    const dedupe = decision.occurrence.businessDedupePolicy;

    return {
      workspaceId: decision.occurrence.workspaceId,
      providerRuleId: decision.rule.providerRuleId,
      sourceDeliveryId: input.sourceDeliveryId,
      channelWorkspaceId: decision.occurrence.channelId
        ? decision.occurrence.workspaceId
        : null,
      channelId: decision.occurrence.channelId,
      leadWorkspaceId: lead ? decision.occurrence.workspaceId : null,
      leadId: lead?.id ?? null,
      supersedesDecisionWorkspaceId: input.supersedesDecisionId
        ? decision.occurrence.workspaceId
        : null,
      supersedesDecisionId: input.supersedesDecisionId,
      decisionCode: decision.decisionCode,
      reasonCode: decision.reasonCode,
      eventName: decision.occurrence.eventName,
      occurredAt: new Date(decision.occurrence.occurredAt),
      occurrenceKey: decision.occurrence.occurrenceKey,
      evaluationKey: input.evaluationKey,
      decisionFingerprint: input.decisionFingerprint,
      decisionVersion: input.decisionVersion,
      engineVersion: decision.engineVersion,
      parserVersion: decision.parserVersion,
      contactIdentityHash: decision.occurrence.contactIdentityHash,
      businessDedupeMode: dedupe?.mode ?? null,
      businessDedupeScopeKey: dedupe?.scopeKey ?? null,
      businessDedupeWindowSeconds:
        dedupe?.mode === "rolling_window" ? dedupe.windowSeconds : null,
      valueCents: decision.conversion.valueCents,
      currency: decision.conversion.currency,
      normalizedOccurrence: this.json(decision.occurrence),
      ruleSnapshot: this.json(decision.rule),
      catalogSnapshot: decision.catalog
        ? this.json(decision.catalog)
        : Prisma.DbNull,
      conversionSnapshot: this.json(decision.conversion),
      leadResolution: this.json(decision.leadResolution),
      decisionJson: this.json(decision),
    };
  }

  private hydrate(
    record: ProviderConversionDecisionAudit,
  ): PersistedProviderConversionDecision {
    const decision = providerConversionDecisionSchema.parse(
      record.decisionJson,
    );

    return {
      id: record.id,
      workspaceId: record.workspaceId,
      providerRuleId: record.providerRuleId,
      sourceDeliveryId: record.sourceDeliveryId,
      channelId: record.channelId,
      leadId: record.leadId,
      evaluationKey: record.evaluationKey,
      decisionFingerprint: record.decisionFingerprint,
      decisionVersion: record.decisionVersion,
      supersedesDecisionId: record.supersedesDecisionId,
      decisionCode: decision.decisionCode,
      reasonCode: record.reasonCode,
      eventName: decision.occurrence.eventName,
      occurredAt: record.occurredAt,
      occurrenceKey: record.occurrenceKey,
      decision,
      createdAt: record.createdAt,
    };
  }

  private assertVersionTransition(input: {
    latest: ProviderConversionDecisionAudit | null;
    reevaluation: boolean;
    supersedesDecisionId: string | null;
  }): void {
    if (!input.reevaluation) {
      if (input.latest) {
        throw new ProviderConversionDecisionPersistenceError(
          "implicit_reevaluation_not_allowed",
          "An existing occurrence can only be changed by explicit reevaluation",
        );
      }
      return;
    }

    if (!input.latest || !input.supersedesDecisionId) {
      throw new ProviderConversionDecisionPersistenceError(
        "invalid_reevaluation_request",
        "A reevaluation requires an existing frozen decision",
      );
    }
    if (input.latest.id !== input.supersedesDecisionId) {
      throw new ProviderConversionDecisionPersistenceError(
        "stale_superseded_decision",
        "A reevaluation must supersede the latest decision version",
      );
    }
  }

  private fingerprint(decision: ProviderConversionDecisionDto): string {
    return createHash("sha256")
      .update(this.stableJson(decision), "utf8")
      .digest("hex");
  }

  private stableJson(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(",")}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${this.stableJson(entryValue)}`,
      )
      .join(",")}}`;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private requiredIdentifier(value: string, field: string): string {
    const normalized = value.trim();
    if (normalized) return normalized;

    throw new ProviderConversionDecisionPersistenceError(
      "invalid_persistence_input",
      `${field} is required`,
    );
  }

  private hash(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private lockKeys(
    workspaceId: string,
    providerRuleId: string,
    occurrenceKey: string,
  ): { first: number; second: number } {
    const digest = createHash("sha256")
      .update(`${workspaceId}\0${providerRuleId}\0${occurrenceKey}`, "utf8")
      .digest();

    return {
      first: digest.readInt32BE(0),
      second: digest.readInt32BE(4),
    };
  }
}
