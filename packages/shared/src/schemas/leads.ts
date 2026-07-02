import { z } from "zod";

export const leadStatuses = [
  "new",
  "active",
  "qualified",
  "converted",
  "lost"
] as const;

export const leadListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  status: z.enum(leadStatuses).optional(),
  eventName: z.string().trim().min(1).max(120).optional(),
  campaignId: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const leadListItemSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1).nullable(),
  phoneDisplay: z.string().min(1).nullable(),
  phoneHash: z.string().min(1),
  status: z.enum(leadStatuses),
  source: z.string().min(1).nullable(),
  campaignId: z.string().min(1).nullable(),
  campaignName: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  lastEventName: z.string().min(1).nullable(),
  score: z.number().int().min(0).max(100),
  firstMessageAt: z.string().datetime().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const leadListSchema = z.array(leadListItemSchema);

export type LeadStatusDto = z.infer<typeof leadListItemSchema>["status"];
export type LeadListQueryDto = z.infer<typeof leadListQuerySchema>;
export type LeadListItemDto = z.infer<typeof leadListItemSchema>;
