import { z } from "zod";

const alertPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 0 || (value.length >= 10 && value.length <= 13), {
    message: "Telefone deve ter entre 10 e 13 digitos",
  });

export const workspaceOpsAlertSettingsInputSchema = z
  .object({
    enabled: z.boolean(),
    alertPhone: alertPhoneSchema.optional().default(""),
    disconnectAlerts: z.boolean().optional().default(true),
    webhookSilenceAlerts: z.boolean().optional().default(true),
    silenceThresholdHours: z.number().int().min(1).max(24 * 30).optional().default(24),
    debounceHours: z.number().int().min(1).max(24 * 30).optional().default(6),
  })
  .superRefine((value, context) => {
    if (value.enabled && !value.alertPhone) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["alertPhone"], message: "Telefone e obrigatorio quando alertas estao ativos" });
    }
  });

export const workspaceOpsAlertSettingsSchema = z.object({
  id: z.string().nullable(),
  workspaceId: z.string(),
  enabled: z.boolean(),
  alertPhoneE164: z.string().nullable(),
  disconnectAlerts: z.boolean(),
  webhookSilenceAlerts: z.boolean(),
  silenceThresholdHours: z.number().int(),
  debounceHours: z.number().int(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export type WorkspaceOpsAlertSettingsInput = z.infer<
  typeof workspaceOpsAlertSettingsInputSchema
>;

export type WorkspaceOpsAlertSettings = z.infer<
  typeof workspaceOpsAlertSettingsSchema
>;
