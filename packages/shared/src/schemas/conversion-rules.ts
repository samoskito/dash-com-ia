import { z } from "zod";
import {
  conversionEventItemSchema,
  conversionEventNameSchema,
} from "./conversion-events";

export const legacyConversionTriggerTypes = [
  "keyword",
  "whatsapp_label",
] as const;
export const providerConversionTriggerTypes = [
  "provider_automation",
  "structured_catalog",
] as const;
export const conversionTriggerTypes = [
  ...legacyConversionTriggerTypes,
  ...providerConversionTriggerTypes,
] as const;

export const legacyConversionTriggerTypeSchema = z.enum(
  legacyConversionTriggerTypes,
);
export const providerConversionTriggerTypeSchema = z.enum(
  providerConversionTriggerTypes,
);
export const conversionTriggerTypeSchema = z.enum(conversionTriggerTypes);

export const conversionMatchModeSchema = z.enum(["contains", "exact"]);

export const providerConversionRuleModes = [
  "observation",
  "production",
] as const;
export const providerConversionRuleModeSchema = z.enum(
  providerConversionRuleModes,
);

export const providerConversionExecutionStatuses = [
  "observed",
  "eligible",
  "materialized",
  "duplicate",
  "blocked",
  "failed",
] as const;
export const providerConversionExecutionStatusSchema = z.enum(
  providerConversionExecutionStatuses,
);

const idSchema = z.string().trim().min(1).max(255);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const catalogTextSchema = z.string().trim().min(1).max(180);
const catalogAttributeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/);

export const conversionRuleCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  triggerType: legacyConversionTriggerTypeSchema,
  triggerValue: z.string().trim().min(1).max(180),
  matchMode: conversionMatchModeSchema.default("contains"),
  eventName: conversionEventNameSchema,
  // Legacy field. New conversion sending uses the workspace MetaConversionDestination.
  pixelId: z.string().trim().min(1).max(80).nullable().optional(),
  defaultValueCents: z.number().int().positive().nullable().optional(),
  defaultCurrency: z.string().trim().min(3).max(3).nullable().optional(),
  defaultContentName: z.string().trim().min(1).max(180).nullable().optional(),
  defaultItems: z.array(conversionEventItemSchema).nullable().optional(),
  active: z.boolean().default(true),
});

export const conversionRuleUpdateInputSchema = conversionRuleCreateInputSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export const conversionRuleSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  triggerType: conversionTriggerTypeSchema,
  triggerValue: z.string().min(1),
  matchMode: conversionMatchModeSchema,
  eventName: conversionEventNameSchema,
  // Legacy field. New conversion sending uses the workspace MetaConversionDestination.
  pixelId: z.string().nullable(),
  defaultValueCents: z.number().int().positive().nullable().optional(),
  defaultCurrency: z.string().trim().min(3).max(3).nullable().optional(),
  defaultContentName: z.string().trim().min(1).max(180).nullable().optional(),
  defaultItems: z.array(conversionEventItemSchema).nullable().optional(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversionTriggerEvaluationInputSchema = z.object({
  messageText: z.string().trim().optional(),
  labels: z.array(z.string().trim().min(1)).default([]),
});

export const providerConversionCatalogAttributeInputSchema = z.object({
  key: catalogAttributeKeySchema,
  label: catalogTextSchema,
});

export const providerConversionCatalogVariantInputSchema = z.object({
  attributeValues: z.array(catalogTextSchema).min(1).max(2),
  aliases: z.array(z.array(catalogTextSchema).max(20)).max(2).default([]),
  valueCents: z.number().int().positive(),
  contentName: catalogTextSchema.nullable().optional(),
});

export const providerConversionCatalogInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    productName: catalogTextSchema,
    currency: currencySchema.default("BRL"),
    attributes: z
      .array(providerConversionCatalogAttributeInputSchema)
      .min(1)
      .max(2),
    variants: z
      .array(providerConversionCatalogVariantInputSchema)
      .min(1)
      .max(500),
  })
  .superRefine((catalog, context) => {
    const attributeKeys = new Set<string>();

    catalog.attributes.forEach((attribute, index) => {
      if (attributeKeys.has(attribute.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cada atributo do catalogo deve ter uma chave unica",
          path: ["attributes", index, "key"],
        });
      }
      attributeKeys.add(attribute.key);
    });

    catalog.variants.forEach((variant, index) => {
      if (variant.attributeValues.length !== catalog.attributes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A variante deve informar um valor para cada atributo",
          path: ["variants", index, "attributeValues"],
        });
      }

      if (variant.aliases.length > catalog.attributes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Os aliases devem acompanhar os atributos do catalogo",
          path: ["variants", index, "aliases"],
        });
      }
    });
  });

const providerConversionRuleBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  connectionId: idSchema,
  channelIds: z
    .array(idSchema)
    .min(1)
    .max(100)
    .refine((channelIds) => new Set(channelIds).size === channelIds.length, {
      message: "Cada canal deve ser informado uma unica vez",
    }),
  mode: providerConversionRuleModeSchema.default("observation"),
});

const providerConversionRuleBaseShape = providerConversionRuleBaseSchema.shape;

export const providerConversionRuleCreateInputSchema = z.union([
  z.object({
    ...providerConversionRuleBaseShape,
    triggerType: z.literal("provider_automation"),
    eventName: z.literal("QualifiedLead"),
  }),
  z.object({
    ...providerConversionRuleBaseShape,
    triggerType: z.literal("provider_automation"),
    eventName: z.literal("Purchase"),
    defaultValueCents: z.number().int().positive(),
    defaultCurrency: currencySchema.default("BRL"),
    defaultContentName: catalogTextSchema.nullable().optional(),
  }),
  z.object({
    ...providerConversionRuleBaseShape,
    triggerType: z.literal("structured_catalog"),
    eventName: z.literal("Purchase"),
    catalog: providerConversionCatalogInputSchema,
  }),
]);

export const providerConversionRuleUpdateInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    channelIds: z.array(idSchema).min(1).max(100).optional(),
    mode: providerConversionRuleModeSchema.optional(),
    defaultValueCents: z.number().int().positive().nullable().optional(),
    defaultCurrency: currencySchema.nullable().optional(),
    defaultContentName: catalogTextSchema.nullable().optional(),
    catalog: providerConversionCatalogInputSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export const providerConversionEndpointSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  providerRuleId: idSchema,
  secretVersion: z.number().int().positive(),
  lastDeliveryAt: z.string().datetime().nullable(),
  lastSuccessfulParseAt: z.string().datetime().nullable(),
  rotatedAt: z.string().datetime().nullable(),
  removedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const providerConversionEndpointSecretResultSchema = z.object({
  endpoint: providerConversionEndpointSchema,
  webhookUrl: z.string().url(),
});

export const providerConversionCatalogAttributeSchema =
  providerConversionCatalogAttributeInputSchema.extend({
    id: idSchema,
    position: z.number().int().min(1).max(2),
  });

export const providerConversionCatalogVariantSchema =
  providerConversionCatalogVariantInputSchema.extend({
    id: idSchema,
    normalizedKey: z.string().min(1).max(500),
    active: z.boolean(),
  });

export const providerConversionCatalogSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  productName: z.string().min(1),
  currency: z.string().length(3),
  active: z.boolean(),
  attributes: z.array(providerConversionCatalogAttributeSchema).min(1).max(2),
  variants: z.array(providerConversionCatalogVariantSchema),
});

export const structuredCatalogMatchReasonCodes = [
  "matched",
  "rule_inactive",
  "catalog_inactive",
  "missing_attribute",
  "ambiguous_attribute",
  "unknown_combination",
  "ambiguous_variant",
  "missing_price",
  "ambiguous_price",
  "price_mismatch",
] as const;

export const structuredCatalogMatchReasonCodeSchema = z.enum(
  structuredCatalogMatchReasonCodes,
);

export const structuredCatalogTestMessageInputSchema = z.object({
  messageText: z.string().trim().min(1).max(8_192),
});

export const structuredCatalogParsedAttributeSchema = z.object({
  key: catalogAttributeKeySchema,
  label: catalogTextSchema,
  value: catalogTextSchema,
});

export const structuredCatalogTestMessageResultSchema = z.object({
  matched: z.boolean(),
  reasonCode: structuredCatalogMatchReasonCodeSchema,
  parsedAttributes: z.array(structuredCatalogParsedAttributeSchema).max(2),
  parsedValueCents: z.number().int().positive().nullable(),
  catalogVariantId: idSchema.nullable(),
  contentName: catalogTextSchema.nullable(),
  currency: currencySchema.nullable(),
});

export const providerConversionExecutionSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  providerRuleId: idSchema,
  sourceDeliveryId: idSchema,
  channelId: idSchema.nullable(),
  externalExecutionKey: z.string().min(1).max(500),
  occurredAt: z.string().datetime(),
  status: providerConversionExecutionStatusSchema,
  reasonCode: z.string().min(1).max(120).nullable(),
  matchedCatalogVariantId: idSchema.nullable(),
  valueCents: z.number().int().positive().nullable(),
  currency: z.string().length(3).nullable(),
  leadId: idSchema.nullable(),
  conversionEventLogId: idSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const providerConversionRuleSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  conversionRule: conversionRuleSchema,
  connectionId: idSchema,
  mode: providerConversionRuleModeSchema,
  parserReleaseId: idSchema,
  productionActivatedAt: z.string().datetime().nullable(),
  channelIds: z.array(idSchema),
  endpoint: providerConversionEndpointSchema.nullable(),
  catalog: providerConversionCatalogSchema.nullable(),
  lastExecution: providerConversionExecutionSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const providerConversionRuleListSchema = z.array(
  providerConversionRuleSchema,
);

export const providerConversionRuleCreateResultSchema = z.object({
  rule: providerConversionRuleSchema,
  webhookUrl: z.string().url().nullable(),
});

export const conversionRuleListSchema = z.array(conversionRuleSchema);

export type ConversionTriggerTypeDto = z.infer<
  typeof conversionTriggerTypeSchema
>;
export type ConversionMatchModeDto = z.infer<typeof conversionMatchModeSchema>;
export type ConversionRuleCreateInputDto = z.infer<
  typeof conversionRuleCreateInputSchema
>;
export type ConversionRuleUpdateInputDto = z.infer<
  typeof conversionRuleUpdateInputSchema
>;
export type ConversionRuleDto = z.infer<typeof conversionRuleSchema>;
export type ConversionTriggerEvaluationInputDto = z.infer<
  typeof conversionTriggerEvaluationInputSchema
>;
export type LegacyConversionTriggerTypeDto = z.infer<
  typeof legacyConversionTriggerTypeSchema
>;
export type ProviderConversionTriggerTypeDto = z.infer<
  typeof providerConversionTriggerTypeSchema
>;
export type ProviderConversionRuleModeDto = z.infer<
  typeof providerConversionRuleModeSchema
>;
export type ProviderConversionExecutionStatusDto = z.infer<
  typeof providerConversionExecutionStatusSchema
>;
export type ProviderConversionCatalogInputDto = z.infer<
  typeof providerConversionCatalogInputSchema
>;
export type ProviderConversionRuleCreateInputDto = z.infer<
  typeof providerConversionRuleCreateInputSchema
>;
export type ProviderConversionRuleUpdateInputDto = z.infer<
  typeof providerConversionRuleUpdateInputSchema
>;
export type ProviderConversionEndpointDto = z.infer<
  typeof providerConversionEndpointSchema
>;
export type ProviderConversionEndpointSecretResultDto = z.infer<
  typeof providerConversionEndpointSecretResultSchema
>;
export type ProviderConversionCatalogDto = z.infer<
  typeof providerConversionCatalogSchema
>;
export type StructuredCatalogMatchReasonCodeDto = z.infer<
  typeof structuredCatalogMatchReasonCodeSchema
>;
export type StructuredCatalogTestMessageInputDto = z.infer<
  typeof structuredCatalogTestMessageInputSchema
>;
export type StructuredCatalogTestMessageResultDto = z.infer<
  typeof structuredCatalogTestMessageResultSchema
>;
export type ProviderConversionRuleDto = z.infer<
  typeof providerConversionRuleSchema
>;
export type ProviderConversionRuleCreateResultDto = z.infer<
  typeof providerConversionRuleCreateResultSchema
>;
export type ProviderConversionExecutionDto = z.infer<
  typeof providerConversionExecutionSchema
>;
