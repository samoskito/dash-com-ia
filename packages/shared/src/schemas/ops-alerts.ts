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

export type WorkspaceOpsAlertSettingsInput = z.infer<
  typeof workspaceOpsAlertSettingsInputSchema
>;
