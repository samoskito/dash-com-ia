import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  providerConversionDecisionOutcome,
  type ProviderConversionCanonicalDecision,
} from "./provider-conversion-decision.types";
import type { PersistedProviderConversionDecision } from "./provider-conversion-decision.repository";

const terminalExecutionStatuses = new Set([
  "materialized",
  "duplicate",
]);
const preservedReviewStatuses = new Set([
  "approved",
  "sent",
  "duplicate",
  "rejected",
  "corrected_after_send",
]);

export type ProviderConversionTechnicalDisposition =
  | {
      state: "observed";
      reasonCode: string;
    }
  | {
      state: "eligible";
      reasonCode: string;
    }
  | {
      state: "blocked";
      reasonCode: string;
    };

export type ProviderConversionOrchestrationResult = {
  executionId: string | null;
  eligibleExecutionId: string | null;
  reviewId: string | null;
};

type ProviderConversionPersistenceClient = Pick<
  Prisma.TransactionClient,
  "providerConversionRuleExecution" | "purchaseReview" | "purchaseReviewItem"
>;

@Injectable()
export class ProviderConversionOrchestrator {
  private readonly logger = new Logger(ProviderConversionOrchestrator.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async orchestrate(input: {
    persistedDecision: PersistedProviderConversionDecision;
    disposition: ProviderConversionTechnicalDisposition;
    /**
     * A UAZAPI chat-label match in observation mode is useful evidence even
     * without paid attribution. Keep that one fail-closed outcome visible to
     * the operator, but never make it eligible for production processing.
     */
    recordIgnoredObservation?: boolean;
  }): Promise<ProviderConversionOrchestrationResult> {
    const { persistedDecision } = input;
    const outcome = providerConversionDecisionOutcome(
      persistedDecision.decision,
    );

    if (
      outcome === "ignored" &&
      input.recordIgnoredObservation &&
      persistedDecision.decision.decisionCode === "ignored_untracked_lead" &&
      persistedDecision.decision.rule.mode === "observation" &&
      input.disposition.state === "blocked"
    ) {
      const execution = await this.persistExecution({
        persistedDecision,
        disposition: input.disposition,
      });
      this.logResult(input, "execution_blocked", execution.id);
      return {
        executionId: execution.id,
        eligibleExecutionId: null,
        reviewId: null,
      };
    }

    if (outcome === "ignored" || outcome === "duplicate") {
      this.logResult(input, "audit_only");
      return this.emptyResult();
    }

    if (outcome === "review") {
      const reviewId = await this.prisma.$transaction((transaction) =>
        this.persistReview(transaction, persistedDecision),
      );
      this.logResult(input, "review_created");
      return {
        executionId: null,
        eligibleExecutionId: null,
        reviewId,
      };
    }

    if (input.disposition.state === "observed") {
      this.logResult(input, "observation_only");
      return this.emptyResult();
    }

    const execution = await this.persistExecution({
      persistedDecision,
      disposition: input.disposition,
    });
    this.logResult(
      input,
      execution.status === "eligible"
        ? "execution_eligible"
        : execution.status === "blocked"
          ? "execution_blocked"
          : `execution_${execution.status}`,
      execution.id,
    );

    return {
      executionId: execution.id,
      eligibleExecutionId:
        execution.status === "eligible" ? execution.id : null,
      reviewId: null,
    };
  }

  private async persistExecution(input: {
    persistedDecision: PersistedProviderConversionDecision;
    disposition: Exclude<
      ProviderConversionTechnicalDisposition,
      { state: "observed" }
    >;
  }): Promise<{ id: string; status: string }> {
    const persisted = input.persistedDecision;
    const decision = persisted.decision;
    const status =
      input.disposition.state === "eligible" ? "eligible" : "blocked";
    const existing =
      await this.prisma.providerConversionRuleExecution.findUnique({
        where: {
          providerRuleId_externalExecutionKey: {
            providerRuleId: persisted.providerRuleId,
            externalExecutionKey: persisted.occurrenceKey,
          },
        },
        select: {
          id: true,
          status: true,
          providerDecisionId: true,
        },
      });

    if (existing && terminalExecutionStatuses.has(existing.status)) {
      return existing;
    }
    if (
      existing?.providerDecisionId === persisted.id &&
      existing.status === status
    ) {
      return existing;
    }

    const catalogVariantId = this.singleCatalogVariantId(decision);
    const normalizedResult = this.normalizedResult(persisted);

    return this.prisma.providerConversionRuleExecution.upsert({
      where: {
        providerRuleId_externalExecutionKey: {
          providerRuleId: persisted.providerRuleId,
          externalExecutionKey: persisted.occurrenceKey,
        },
      },
      create: {
        workspaceId: persisted.workspaceId,
        providerRuleId: persisted.providerRuleId,
        sourceDeliveryId: persisted.sourceDeliveryId,
        channelWorkspaceId: persisted.channelId
          ? persisted.workspaceId
          : null,
        channelId: persisted.channelId,
        matchedCatalogVariantWorkspaceId: catalogVariantId
          ? persisted.workspaceId
          : null,
        matchedCatalogVariantId: catalogVariantId,
        providerDecisionWorkspaceId: persisted.workspaceId,
        providerDecisionId: persisted.id,
        externalExecutionKey: persisted.occurrenceKey,
        occurredAt: persisted.occurredAt,
        contactIdentityHash: decision.occurrence.contactIdentityHash,
        status,
        reasonCode: input.disposition.reasonCode,
        normalizedResult,
        valueCents: decision.conversion.valueCents,
        currency: decision.conversion.currency,
        leadId: persisted.leadId,
      },
      update: {
        sourceDeliveryId: persisted.sourceDeliveryId,
        channelWorkspaceId: persisted.channelId
          ? persisted.workspaceId
          : null,
        channelId: persisted.channelId,
        matchedCatalogVariantWorkspaceId: catalogVariantId
          ? persisted.workspaceId
          : null,
        matchedCatalogVariantId: catalogVariantId,
        providerDecisionWorkspaceId: persisted.workspaceId,
        providerDecisionId: persisted.id,
        occurredAt: persisted.occurredAt,
        contactIdentityHash: decision.occurrence.contactIdentityHash,
        status,
        reasonCode: input.disposition.reasonCode,
        normalizedResult,
        valueCents: decision.conversion.valueCents,
        currency: decision.conversion.currency,
        leadId: persisted.leadId,
        processedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });
  }

  private async persistReview(
    client: ProviderConversionPersistenceClient,
    persisted: PersistedProviderConversionDecision,
  ): Promise<string> {
    const decision = persisted.decision;
    if (
      decision.decisionCode !== "review_required" ||
      decision.leadResolution.status !== "resolved"
    ) {
      throw new Error("Only a resolved review decision can create a review");
    }

    const existing = await client.purchaseReview.findUnique({
      where: {
        providerRuleId_externalOccurrenceKey: {
          providerRuleId: persisted.providerRuleId,
          externalOccurrenceKey: persisted.occurrenceKey,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });
    if (existing && preservedReviewStatuses.has(existing.status)) {
      return existing.id;
    }

    const review = await client.purchaseReview.upsert({
      where: {
        providerRuleId_externalOccurrenceKey: {
          providerRuleId: persisted.providerRuleId,
          externalOccurrenceKey: persisted.occurrenceKey,
        },
      },
      create: {
        workspaceId: persisted.workspaceId,
        providerRuleId: persisted.providerRuleId,
        sourceDeliveryId: persisted.sourceDeliveryId,
        channelWorkspaceId: persisted.channelId
          ? persisted.workspaceId
          : null,
        channelId: persisted.channelId,
        providerDecisionWorkspaceId: persisted.workspaceId,
        providerDecisionId: persisted.id,
        externalOccurrenceKey: persisted.occurrenceKey,
        occurredAt: persisted.occurredAt,
        contactIdentityHash: decision.occurrence.contactIdentityHash,
        sourceType:
          decision.occurrence.source === "automation"
            ? "provider_automation"
            : "provider_message",
        messageAuthorType: decision.occurrence.authorType,
        matchedTriggerPhrase: decision.conversion.matchedTriggerPhrase,
        status: "review_required",
        classificationCode: "review_required",
        reasonCode: decision.reasonCode,
        observedPaymentValueCents:
          decision.conversion.observedPaymentValueCents,
        calculatedValueCents: decision.conversion.valueCents,
        effectiveValueCents: decision.conversion.valueCents,
        currency: decision.conversion.currency ?? "BRL",
        leadWorkspaceId: persisted.workspaceId,
        leadId: decision.leadResolution.lead.id,
      },
      update: {
        sourceDeliveryId: persisted.sourceDeliveryId,
        channelWorkspaceId: persisted.channelId
          ? persisted.workspaceId
          : null,
        channelId: persisted.channelId,
        providerDecisionWorkspaceId: persisted.workspaceId,
        providerDecisionId: persisted.id,
        occurredAt: persisted.occurredAt,
        contactIdentityHash: decision.occurrence.contactIdentityHash,
        sourceType:
          decision.occurrence.source === "automation"
            ? "provider_automation"
            : "provider_message",
        messageAuthorType: decision.occurrence.authorType,
        matchedTriggerPhrase: decision.conversion.matchedTriggerPhrase,
        status: "review_required",
        classificationCode: "review_required",
        reasonCode: decision.reasonCode,
        observedPaymentValueCents:
          decision.conversion.observedPaymentValueCents,
        calculatedValueCents: decision.conversion.valueCents,
        effectiveValueCents: decision.conversion.valueCents,
        currency: decision.conversion.currency ?? "BRL",
        leadWorkspaceId: persisted.workspaceId,
        leadId: decision.leadResolution.lead.id,
        version: { increment: 1 },
      },
      select: {
        id: true,
      },
    });

    await client.purchaseReviewItem.deleteMany({
      where: {
        workspaceId: persisted.workspaceId,
        purchaseReviewId: review.id,
      },
    });
    if (decision.conversion.items.length > 0) {
      await client.purchaseReviewItem.createMany({
        data: decision.conversion.items.map((item) => ({
          workspaceId: persisted.workspaceId,
          purchaseReviewId: review.id,
          position: item.position,
          catalogVariantWorkspaceId: item.catalogVariantId
            ? persisted.workspaceId
            : null,
          catalogVariantId: item.catalogVariantId,
          attributeValues: item.parsedAttributes.map(
            (attribute) => attribute.value,
          ),
          quantity: item.quantity,
          unitValueCents: item.unitValueCents,
          subtotalValueCents: item.subtotalValueCents,
          contentName: item.contentName,
        })),
      });
    }

    return review.id;
  }

  private normalizedResult(
    persisted: PersistedProviderConversionDecision,
  ): Prisma.InputJsonValue {
    const decision = persisted.decision;

    return {
      decisionId: persisted.id,
      decisionVersion: persisted.decisionVersion,
      engineVersion: decision.engineVersion,
      parserVersion: decision.parserVersion,
      matched: true,
      classification: "recognized",
      reasonCode: decision.reasonCode,
      matchedTriggerPhrase: decision.conversion.matchedTriggerPhrase,
      items: decision.conversion.items,
      calculatedValueCents: decision.conversion.valueCents,
      observedPaymentValueCents:
        decision.conversion.observedPaymentValueCents,
      contentName: decision.conversion.contentName,
      currency: decision.conversion.currency,
    } as Prisma.InputJsonValue;
  }

  private singleCatalogVariantId(
    decision: ProviderConversionCanonicalDecision,
  ): string | null {
    if (decision.conversion.items.length !== 1) return null;

    return decision.conversion.items[0]?.catalogVariantId ?? null;
  }

  private emptyResult(): ProviderConversionOrchestrationResult {
    return {
      executionId: null,
      eligibleExecutionId: null,
      reviewId: null,
    };
  }

  private logResult(
    input: {
      persistedDecision: PersistedProviderConversionDecision;
      disposition: ProviderConversionTechnicalDisposition;
    },
    effect: string,
    executionId: string | null = null,
  ): void {
    const persisted = input.persistedDecision;
    this.logger.log(
      JSON.stringify({
        event: "provider_conversion_orchestrated",
        workspaceId: persisted.workspaceId,
        sourceDeliveryId: persisted.sourceDeliveryId,
        decisionId: persisted.id,
        decisionVersion: persisted.decisionVersion,
        occurrenceKey: persisted.occurrenceKey,
        decisionCode: persisted.decisionCode,
        disposition: input.disposition.state,
        effect,
        executionId,
      }),
    );
  }
}
