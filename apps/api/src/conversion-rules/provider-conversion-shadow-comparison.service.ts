import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

export type ProviderConversionEngineMode = "legacy" | "shadow" | "canonical";

export type ProviderConversionShadowComparisonResult = {
  id: string;
  matches: boolean;
  mismatchCode: string | null;
  created: boolean;
};

@Injectable()
export class ProviderConversionShadowComparisonService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    workspaceId: string;
    providerRuleId: string;
    sourceDeliveryId: string;
    channelId: string;
    occurrenceKey: string;
    authoritativeEngine: ProviderConversionEngineMode;
    legacyDecision: ProviderConversionDecisionDto | null;
    canonicalDecision: ProviderConversionDecisionDto | null;
  }): Promise<ProviderConversionShadowComparisonResult> {
    const legacyProjection = this.semanticProjection(input.legacyDecision);
    const canonicalProjection = this.semanticProjection(
      input.canonicalDecision,
    );
    const mismatchCode = this.mismatchCode(
      legacyProjection,
      canonicalProjection,
    );
    const comparisonFingerprint = this.hash({
      legacyEngineVersion: input.legacyDecision?.engineVersion ?? null,
      canonicalEngineVersion: input.canonicalDecision?.engineVersion ?? null,
      legacy: legacyProjection,
      canonical: canonicalProjection,
    });
    const unique = {
      providerRuleId: input.providerRuleId,
      occurrenceKey: input.occurrenceKey,
      comparisonFingerprint,
    };
    const existing =
      await this.prisma.providerConversionShadowComparison.findUnique({
        where: {
          providerRuleId_occurrenceKey_comparisonFingerprint: unique,
        },
        select: {
          id: true,
          matches: true,
          mismatchCode: true,
        },
      });
    if (existing) {
      return {
        ...existing,
        created: false,
      };
    }

    try {
      const created =
        await this.prisma.providerConversionShadowComparison.create({
          data: {
            workspaceId: input.workspaceId,
            providerRuleId: input.providerRuleId,
            sourceDeliveryId: input.sourceDeliveryId,
            channelId: input.channelId,
            occurrenceKey: input.occurrenceKey,
            comparisonFingerprint,
            authoritativeEngine: input.authoritativeEngine,
            legacyEngineVersion: input.legacyDecision?.engineVersion ?? null,
            legacyDecisionCode: input.legacyDecision?.decisionCode ?? null,
            legacyReasonCode: input.legacyDecision?.reasonCode ?? null,
            legacyDecision: input.legacyDecision
              ? this.json(input.legacyDecision)
              : Prisma.DbNull,
            canonicalEngineVersion:
              input.canonicalDecision?.engineVersion ?? null,
            canonicalDecisionCode:
              input.canonicalDecision?.decisionCode ?? null,
            canonicalReasonCode: input.canonicalDecision?.reasonCode ?? null,
            canonicalDecision: input.canonicalDecision
              ? this.json(input.canonicalDecision)
              : Prisma.DbNull,
            matches: mismatchCode === null,
            mismatchCode,
          },
          select: {
            id: true,
            matches: true,
            mismatchCode: true,
          },
        });

      return {
        ...created,
        created: true,
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const raced =
        await this.prisma.providerConversionShadowComparison.findUnique({
          where: {
            providerRuleId_occurrenceKey_comparisonFingerprint: unique,
          },
          select: {
            id: true,
            matches: true,
            mismatchCode: true,
          },
        });
      if (!raced) throw error;

      return {
        ...raced,
        created: false,
      };
    }
  }

  private semanticProjection(
    decision: ProviderConversionDecisionDto | null,
  ): Record<string, unknown> | null {
    if (!decision) return null;

    return {
      decisionCode: decision.decisionCode,
      reasonCode: decision.reasonCode,
      eventName: decision.occurrence.eventName,
      occurrenceSource: decision.occurrence.source,
      channelId: decision.occurrence.channelId,
      leadResolution:
        decision.leadResolution.status === "resolved"
          ? {
              status: decision.leadResolution.status,
              leadId: decision.leadResolution.lead.id,
              adId: decision.leadResolution.lead.adId,
              ctwaClid: decision.leadResolution.lead.ctwaClid,
            }
          : {
              status: decision.leadResolution.status,
              reasonCode: decision.leadResolution.reasonCode,
            },
      conversion: decision.conversion,
    };
  }

  private mismatchCode(
    legacy: Record<string, unknown> | null,
    canonical: Record<string, unknown> | null,
  ): string | null {
    if (legacy === null || canonical === null) {
      return legacy === canonical ? null : "applicability_mismatch";
    }
    if (legacy.decisionCode !== canonical.decisionCode) {
      return "decision_code_mismatch";
    }
    if (
      this.stableJson(legacy.leadResolution) !==
      this.stableJson(canonical.leadResolution)
    ) {
      return "lead_resolution_mismatch";
    }
    if (
      this.stableJson(legacy.conversion) !==
      this.stableJson(canonical.conversion)
    ) {
      return "conversion_payload_mismatch";
    }
    if (legacy.reasonCode !== canonical.reasonCode) {
      return "reason_code_mismatch";
    }
    if (
      legacy.eventName !== canonical.eventName ||
      legacy.occurrenceSource !== canonical.occurrenceSource ||
      legacy.channelId !== canonical.channelId
    ) {
      return "occurrence_mismatch";
    }

    return null;
  }

  private hash(value: unknown): string {
    return createHash("sha256")
      .update(this.stableJson(value), "utf8")
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

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
