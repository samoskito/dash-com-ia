import { z } from "zod";

export const leadStatuses = [
  "new",
  "active",
  "qualified",
  "converted",
  "lost",
] as const;

export const leadListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  status: z.enum(leadStatuses).optional(),
  eventName: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  campaignId: z.string().trim().min(1).max(120).optional(),
  adSetId: z.string().trim().min(1).max(120).optional(),
  adId: z.string().trim().min(1).max(120).optional(),
  since: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  until: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const leadListItemSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1).nullable(),
  phoneDisplay: z.string().min(1).nullable(),
  phoneHash: z.string().min(1),
  status: z.enum(leadStatuses),
  source: z.string().min(1).nullable(),
  labels: z.array(z.string().min(1)).default([]),
  campaignId: z.string().min(1).nullable(),
  campaignName: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  lastEventName: z.string().min(1).nullable(),
  firstMessageAt: z.string().datetime().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const leadListSchema = z.array(leadListItemSchema);

export const leadListPageSchema = z.object({
  items: leadListSchema,
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const leadDetailConversionEventSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().min(1),
  status: z.string().min(1),
  sourceTrigger: z.string().min(1),
  pixelId: z.string().min(1).nullable(),
  campaignId: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const leadDetailWebhookEventSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  eventType: z.string().min(1),
  status: z.string().min(1),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});

export const leadDetailSchema = z.object({
  lead: leadListItemSchema,
  attribution: z.object({
    campaignName: z.string().min(1).nullable(),
    adSetName: z.string().min(1).nullable(),
    adName: z.string().min(1).nullable(),
  }),
  conversionEvents: z.array(leadDetailConversionEventSchema),
  webhookEvents: z.array(leadDetailWebhookEventSchema),
});

export type LeadStatusDto = z.infer<typeof leadListItemSchema>["status"];
export type LeadListQueryDto = z.infer<typeof leadListQuerySchema>;
export type LeadListItemDto = z.infer<typeof leadListItemSchema>;
export type LeadListPageDto = z.infer<typeof leadListPageSchema>;
export type LeadDetailConversionEventDto = z.infer<
  typeof leadDetailConversionEventSchema
>;
export type LeadDetailWebhookEventDto = z.infer<
  typeof leadDetailWebhookEventSchema
>;
export type LeadDetailDto = z.infer<typeof leadDetailSchema>;
