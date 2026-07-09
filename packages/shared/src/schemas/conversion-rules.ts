import { z } from "zod";
import {
  conversionEventItemSchema,
  conversionEventNameSchema
} from "./conversion-events";

export const conversionTriggerTypeSchema = z.enum([
  "keyword",
  "whatsapp_label"
]);

export const conversionMatchModeSchema = z.enum(["contains", "exact"]);

export const conversionRuleCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  triggerType: conversionTriggerTypeSchema,
  triggerValue: z.string().trim().min(1).max(180),
  matchMode: conversionMatchModeSchema.default("contains"),
  eventName: conversionEventNameSchema,
  // Legacy field. New conversion sending uses the workspace MetaConversionDestination.
  pixelId: z.string().trim().min(1).max(80).nullable().optional(),
  defaultValueCents: z.number().int().positive().nullable().optional(),
  defaultCurrency: z.string().trim().min(3).max(3).nullable().optional(),
  defaultContentName: z.string().trim().min(1).max(180).nullable().optional(),
  defaultItems: z.array(conversionEventItemSchema).nullable().optional(),
  active: z.boolean().default(true)
});

export const conversionRuleUpdateInputSchema = conversionRuleCreateInputSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar"
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
  updatedAt: z.string().datetime()
});

export const conversionTriggerEvaluationInputSchema = z.object({
  messageText: z.string().trim().optional(),
  labels: z.array(z.string().trim().min(1)).default([])
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
