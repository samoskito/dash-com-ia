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

export const diagnosticTimelineItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "diagnostic_event",
    "webhook_log",
    "integration_log",
    "conversion_event_log",
    "job_attempt",
    "audit_log"
  ]),
  label: z.string().min(1),
  status: z.string().min(1),
  occurredAt: z.string().datetime(),
  summaryPayload: z.record(z.unknown()).nullable()
});

export const diagnosticEventDetailSchema = diagnosticEventSchema.extend({
  summaryPayload: z.record(z.unknown()).nullable(),
  timeline: z.array(diagnosticTimelineItemSchema)
});

export const diagnosticRetryInputSchema = z.object({
  reason: z.string().trim().min(10).max(500)
});

export const diagnosticRetryResultSchema = z.object({
  ok: z.literal(true),
  status: z.literal("queued"),
  diagnosticEventId: z.string().min(1),
  auditLogId: z.string().min(1),
  jobAttemptId: z.string().min(1)
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
export type DiagnosticTimelineItemDto = z.infer<
  typeof diagnosticTimelineItemSchema
>;
export type DiagnosticEventDetailDto = z.infer<
  typeof diagnosticEventDetailSchema
>;
export type DiagnosticRetryInputDto = z.infer<typeof diagnosticRetryInputSchema>;
export type DiagnosticRetryResultDto = z.infer<
  typeof diagnosticRetryResultSchema
>;
