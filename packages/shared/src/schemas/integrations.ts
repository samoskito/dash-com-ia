import { z } from "zod";
import { integrationStatuses } from "../statuses";

export const integrationProviderSchema = z.enum(["meta", "uazapi", "asaas"]);

export const integrationHealthSchema = z.object({
  provider: integrationProviderSchema,
  status: z.enum(integrationStatuses),
  checkedAt: z.string().datetime(),
  message: z.string().optional()
});

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type IntegrationHealthDto = z.infer<typeof integrationHealthSchema>;
