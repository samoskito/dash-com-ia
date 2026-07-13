import { z } from "zod";

export const conversionEventNameSchema = z.enum([
  "LeadSubmitted",
  "QualifiedLead",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "RatingProvided",
  "ReviewProvided",
  "ViewContent",
  "AddToCart",
  "CartAbandoned",
  "InitiateCheckout",
  "Purchase",
  "OrderCreated"
]);

export const conversionEventLogStatusSchema = z.enum([
  "pending_meta_context",
  "pending_value",
  "ready_to_send",
  "queued",
  "sent",
  "error",
  "imported",
  "not_eligible",
  "not_configured",
  "skipped"
]);

export const conversionEventErrorCodeSchema = z.enum([
  "MissingMetaDestination",
  "MissingAccessToken",
  "MissingPhoneHash",
  "MissingCtwaClid",
  "MissingAdId",
  "EventValueMissing",
  "MetaCapiRejected",
  "MetaCapiNetworkError"
]);

export const conversionEventItemSchema = z.object({
  id: z.string().trim().min(1),
  quantity: z.number().int().positive().optional(),
  item_price: z.number().positive().optional()
});

export const conversionEventCustomDataSchema = z.object({
  value: z.number().positive().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  order_id: z.string().trim().min(1).optional(),
  content_name: z.string().trim().min(1).optional(),
  content_type: z.string().trim().min(1).optional(),
  contents: z.array(conversionEventItemSchema).optional(),
  num_items: z.number().int().positive().optional(),
  ad_id: z.string().trim().min(1).optional()
});

export const conversionEventTestInputSchema = z.object({
  workspaceId: z.string().trim().min(1),
  leadId: z.string().trim().min(1).optional(),
  eventName: conversionEventNameSchema,
  phoneHash: z.string().trim().min(1),
  adId: z.string().trim().min(1),
  ctwaClid: z.string().trim().min(1),
  valueCents: z.number().int().positive().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  contentName: z.string().trim().min(1).optional(),
  testEventCode: z.string().trim().min(1)
});

export type ConversionEventNameDto = z.infer<typeof conversionEventNameSchema>;
export type ConversionEventLogStatusDto = z.infer<
  typeof conversionEventLogStatusSchema
>;
export type ConversionEventErrorCodeDto = z.infer<
  typeof conversionEventErrorCodeSchema
>;
export type ConversionEventItemDto = z.infer<typeof conversionEventItemSchema>;
export type ConversionEventCustomDataDto = z.infer<
  typeof conversionEventCustomDataSchema
>;
export type ConversionEventTestInputDto = z.infer<
  typeof conversionEventTestInputSchema
>;
