import { z } from "zod";
import { integrationStatuses } from "../statuses";

export const integrationProviderSchema = z.enum(["meta", "uazapi", "asaas"]);

export const integrationHealthSchema = z.object({
  provider: integrationProviderSchema,
  status: z.enum(integrationStatuses),
  checkedAt: z.string().datetime(),
  message: z.string().optional()
});

export const integrationHealthSummarySchema = z.object({
  checkedAt: z.string().datetime(),
  providers: z.array(integrationHealthSchema)
});

export const integrationStartActionSchema = z.object({
  provider: integrationProviderSchema,
  action: z.enum(["configure_env", "oauth_redirect", "open_checkout", "wait_webhook"]),
  label: z.string().min(1),
  href: z.string().min(1).optional(),
  missingEnv: z.array(z.string()).default([])
});

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type IntegrationHealthDto = z.infer<typeof integrationHealthSchema>;
export type IntegrationHealthSummaryDto = z.infer<
  typeof integrationHealthSummarySchema
>;
export type IntegrationStartActionDto = z.infer<
  typeof integrationStartActionSchema
>;
