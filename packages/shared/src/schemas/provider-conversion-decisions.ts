import { z } from "zod";
import { conversionEventNameSchema } from "./conversion-events";
import {
  messagePhraseValueModeSchema,
  providerConversionCatalogSchema,
  providerConversionMessageAuthorScopeSchema,
  providerConversionRuleModeSchema,
  providerConversionTriggerTypeSchema,
  structuredCatalogParsedItemSchema,
} from "./conversion-rules";

const identifierSchema = z.string().trim().min(1).max(500);
const optionalIdentifierSchema = identifierSchema.nullable();
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/u)
  .transform((value) => value.toUpperCase());

export const providerConversionDecisionCodes = [
  "ignored_empty_template",
  "ignored_untracked_lead",
  "review_required",
  "eligible",
  "duplicate",
] as const;

export const providerConversionDecisionCodeSchema = z.enum(
  providerConversionDecisionCodes,
);

export const providerConversionTechnicalDeliveryStates = [
  "observed",
  "queued",
  "sent",
  "blocked_configuration",
  "failed_retryable",
  "failed_permanent",
] as const;

export const providerConversionTechnicalDeliveryStateSchema = z.enum(
  providerConversionTechnicalDeliveryStates,
);

export const providerConversionDecisionAuthorTypeSchema = z.enum([
  "contact",
  "organization_member",
  "bot",
  "unknown",
]);

export const providerConversionPaidLeadSchema = z.object({
  id: identifierSchema,
  phoneHash: identifierSchema,
  campaignId: optionalIdentifierSchema,
  adSetId: optionalIdentifierSchema,
  adId: identifierSchema,
  ctwaClid: identifierSchema,
});

export const providerConversionPaidLeadResolutionSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("resolved"),
      reasonCode: z.literal("paid_lead_resolved"),
      lead: providerConversionPaidLeadSchema,
    }),
    z.object({
      status: z.literal("missing_identity"),
      reasonCode: z.literal("missing_contact_identity"),
    }),
    z.object({
      status: z.literal("not_found"),
      reasonCode: z.enum(["paid_lead_not_found", "paid_attribution_missing"]),
      candidateLeadId: optionalIdentifierSchema,
    }),
    z.object({
      status: z.literal("ambiguous"),
      reasonCode: z.literal("paid_lead_ambiguous"),
      candidateLeadIds: z.array(identifierSchema).min(2).max(10),
    }),
  ],
);

export const providerConversionUnresolvedPaidLeadSchema = z.union([
  z.object({
    status: z.literal("missing_identity"),
    reasonCode: z.literal("missing_contact_identity"),
  }),
  z.object({
    status: z.literal("not_found"),
    reasonCode: z.enum(["paid_lead_not_found", "paid_attribution_missing"]),
    candidateLeadId: optionalIdentifierSchema,
  }),
  z.object({
    status: z.literal("ambiguous"),
    reasonCode: z.literal("paid_lead_ambiguous"),
    candidateLeadIds: z.array(identifierSchema).min(2).max(10),
  }),
]);

export const providerConversionDecisionOccurrenceSchema = z.object({
  source: z.enum(["message", "automation"]),
  provider: z.string().trim().min(1).max(80),
  workspaceId: identifierSchema,
  connectionId: identifierSchema,
  channelId: optionalIdentifierSchema,
  externalDeliveryId: optionalIdentifierSchema,
  externalEventId: optionalIdentifierSchema,
  externalMessageId: optionalIdentifierSchema,
  occurrenceKey: identifierSchema,
  businessDedupePolicy: z
    .discriminatedUnion("mode", [
      z.object({
        mode: z.literal("lifetime"),
        scopeKey: identifierSchema,
      }),
      z.object({
        mode: z.literal("rolling_window"),
        scopeKey: identifierSchema,
        windowSeconds: z.number().int().positive(),
      }),
    ])
    .nullable(),
  eventName: conversionEventNameSchema,
  occurredAt: z.string().datetime(),
  authorType: providerConversionDecisionAuthorTypeSchema.nullable(),
  contactIdentityHash: optionalIdentifierSchema,
  labels: z.array(z.string().trim().min(1).max(240)).max(100).optional(),
  matchedLabel: z.string().trim().min(1).max(240).optional(),
});

export const providerConversionDecisionRuleSnapshotSchema = z.object({
  providerRuleId: identifierSchema,
  conversionRuleId: identifierSchema,
  version: identifierSchema,
  triggerType: providerConversionTriggerTypeSchema,
  eventName: conversionEventNameSchema,
  mode: providerConversionRuleModeSchema,
  active: z.boolean(),
  authorScope: providerConversionMessageAuthorScopeSchema.nullable(),
  triggerPhrases: z.array(z.string().trim().min(1).max(240)).max(50),
  defaultValueCents: z.number().int().positive().nullable(),
  defaultCurrency: currencySchema.nullable(),
  defaultContentName: z.string().trim().min(1).max(180).nullable(),
  // Decisions persisted before U2 carry no value pipeline: they were all fixed.
  valueMode: messagePhraseValueModeSchema.default("fixed"),
  exampleMessage: z.string().max(2_000).nullable().default(null),
});

export const providerConversionDecisionCatalogSnapshotSchema = z.object({
  version: identifierSchema,
  catalog: providerConversionCatalogSchema,
});

export const providerConversionDecisionConversionSchema = z.object({
  matchedTriggerPhrase: z.string().trim().min(1).max(240).nullable(),
  items: z.array(structuredCatalogParsedItemSchema).max(100),
  valueCents: z.number().int().positive().nullable(),
  observedPaymentValueCents: z.number().int().positive().nullable(),
  currency: currencySchema.nullable(),
  contentName: z.string().trim().min(1).max(180).nullable(),
});

const providerConversionDecisionBaseSchema = z.object({
  engineVersion: identifierSchema,
  parserVersion: identifierSchema,
  reasonCode: z.string().trim().min(1).max(160),
  occurrence: providerConversionDecisionOccurrenceSchema,
  rule: providerConversionDecisionRuleSnapshotSchema,
  catalog: providerConversionDecisionCatalogSnapshotSchema.nullable(),
  conversion: providerConversionDecisionConversionSchema,
});

export const providerConversionDecisionSchema = z.discriminatedUnion(
  "decisionCode",
  [
    providerConversionDecisionBaseSchema.extend({
      decisionCode: z.literal("ignored_empty_template"),
      leadResolution: providerConversionPaidLeadResolutionSchema,
    }),
    providerConversionDecisionBaseSchema.extend({
      decisionCode: z.literal("ignored_untracked_lead"),
      leadResolution: providerConversionUnresolvedPaidLeadSchema,
    }),
    providerConversionDecisionBaseSchema.extend({
      decisionCode: z.literal("review_required"),
      leadResolution: z.object({
        status: z.literal("resolved"),
        reasonCode: z.literal("paid_lead_resolved"),
        lead: providerConversionPaidLeadSchema,
      }),
    }),
    providerConversionDecisionBaseSchema.extend({
      decisionCode: z.literal("eligible"),
      leadResolution: z.object({
        status: z.literal("resolved"),
        reasonCode: z.literal("paid_lead_resolved"),
        lead: providerConversionPaidLeadSchema,
      }),
    }),
    providerConversionDecisionBaseSchema.extend({
      decisionCode: z.literal("duplicate"),
      leadResolution: z.object({
        status: z.literal("resolved"),
        reasonCode: z.literal("paid_lead_resolved"),
        lead: providerConversionPaidLeadSchema,
      }),
      duplicateOfDecisionId: optionalIdentifierSchema,
      duplicateOfConversionEventLogId: optionalIdentifierSchema,
    }),
  ],
);

export type ProviderConversionDecisionCodeDto = z.infer<
  typeof providerConversionDecisionCodeSchema
>;
export type ProviderConversionTechnicalDeliveryStateDto = z.infer<
  typeof providerConversionTechnicalDeliveryStateSchema
>;
export type ProviderConversionPaidLeadDto = z.infer<
  typeof providerConversionPaidLeadSchema
>;
export type ProviderConversionPaidLeadResolutionDto = z.infer<
  typeof providerConversionPaidLeadResolutionSchema
>;
export type ProviderConversionDecisionOccurrenceDto = z.infer<
  typeof providerConversionDecisionOccurrenceSchema
>;
export type ProviderConversionDecisionRuleSnapshotDto = z.infer<
  typeof providerConversionDecisionRuleSnapshotSchema
>;
export type ProviderConversionDecisionCatalogSnapshotDto = z.infer<
  typeof providerConversionDecisionCatalogSnapshotSchema
>;
export type ProviderConversionDecisionConversionDto = z.infer<
  typeof providerConversionDecisionConversionSchema
>;
export type ProviderConversionDecisionDto = z.infer<
  typeof providerConversionDecisionSchema
>;
