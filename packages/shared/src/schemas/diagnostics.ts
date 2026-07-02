import { z } from "zod";

export const diagnosticSources = ["meta", "uazapi", "asaas", "internal"] as const;
export const diagnosticSeverities = [
  "info",
  "warning",
  "error",
  "critical"
] as const;

export const diagnosticSourceSchema = z.enum(diagnosticSources);
export const diagnosticSeveritySchema = z.enum(diagnosticSeverities);

export const diagnosticEventSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  source: diagnosticSourceSchema,
  eventType: z.string().min(1),
  severity: diagnosticSeveritySchema,
  status: z.string().min(1),
  occurredAt: z.string().datetime(),
  title: z.string().min(1),
  message: z.string().min(1),
  leadId: z.string().nullable(),
  phoneHash: z.string().nullable(),
  campaignId: z.string().nullable(),
  adSetId: z.string().nullable(),
  adId: z.string().nullable(),
  jobId: z.string().nullable(),
  errorCode: z.string().nullable()
});

export const diagnosticEventCreateSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  source: diagnosticSourceSchema,
  eventType: z.string().min(1),
  severity: diagnosticSeveritySchema.default("info"),
  status: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  leadId: z.string().min(1).optional(),
  phoneHash: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  adSetId: z.string().min(1).optional(),
  adId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  summaryPayload: z.record(z.unknown()).optional()
});

export const diagnosticEventListQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  source: diagnosticSourceSchema.optional(),
  status: z.string().min(1).optional(),
  severity: diagnosticSeveritySchema.optional(),
  eventType: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const diagnosticEventDetailSchema = diagnosticEventSchema.extend({
  summaryPayload: z.record(z.unknown()).nullable()
});

export type DiagnosticSourceDto = z.infer<typeof diagnosticSourceSchema>;
export type DiagnosticSeverityDto = z.infer<typeof diagnosticSeveritySchema>;
export type DiagnosticEventDto = z.infer<typeof diagnosticEventSchema>;
export type DiagnosticEventCreateDto = z.infer<
  typeof diagnosticEventCreateSchema
>;
export type DiagnosticEventListQueryDto = z.infer<
  typeof diagnosticEventListQuerySchema
>;
export type DiagnosticEventDetailDto = z.infer<
  typeof diagnosticEventDetailSchema
>;
