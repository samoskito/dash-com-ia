import { z } from "zod";

export const inboundWebhookProviders = ["umbler"] as const;
export const inboundWebhookParserReleaseStatuses = [
  "observation_only",
  "certified",
  "retired",
] as const;
export const inboundWebhookConnectionStatuses = [
  "observation",
  "production",
  "paused",
] as const;
export const inboundWebhookMutableConnectionStatuses = [
  "observation",
  "paused",
] as const;
export const inboundWebhookChannelStatuses = [
  "discovered",
  "active",
  "paused",
] as const;
export const inboundWebhookMutableChannelStatuses = [
  "active",
  "paused",
] as const;
export const inboundWebhookDeliveryStatuses = [
  "pending",
  "queued",
  "processing",
  "processed",
  "failed",
] as const;
export const inboundWebhookEventClassifications = [
  "eligible_route_resolved",
  "eligible_route_unresolved",
  "ignored_no_ctwa",
  "ignored_outbound",
  "ignored_private",
  "unsupported_event",
  "invalid_payload",
] as const;

export const inboundWebhookProviderSchema = z.enum(inboundWebhookProviders);
export const inboundWebhookParserReleaseStatusSchema = z.enum(
  inboundWebhookParserReleaseStatuses,
);
export const inboundWebhookConnectionStatusSchema = z.enum(
  inboundWebhookConnectionStatuses,
);
export const inboundWebhookMutableConnectionStatusSchema = z.enum(
  inboundWebhookMutableConnectionStatuses,
);
export const inboundWebhookChannelStatusSchema = z.enum(
  inboundWebhookChannelStatuses,
);
export const inboundWebhookMutableChannelStatusSchema = z.enum(
  inboundWebhookMutableChannelStatuses,
);
export const inboundWebhookDeliveryStatusSchema = z.enum(
  inboundWebhookDeliveryStatuses,
);
export const inboundWebhookEventClassificationSchema = z.enum(
  inboundWebhookEventClassifications,
);

const idSchema = z.string().trim().min(1).max(255);
const parserVersionSchema = z.string().trim().min(1).max(80);
const dateTimeSchema = z.string().datetime();
const normalizedCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const oneTimeSecretSchema = z.string().min(43).max(512);

export const inboundWebhookDisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine((value) => !/[\u0000-\u001f\u007f<>]/u.test(value), {
    message: "Nome de conexao invalido",
  });

export const inboundWebhookConnectionCreateInputSchema = z.object({
  provider: inboundWebhookProviderSchema,
  displayName: inboundWebhookDisplayNameSchema,
});

export const inboundWebhookConnectionStatusUpdateInputSchema = z.object({
  status: inboundWebhookMutableConnectionStatusSchema,
});

export const inboundWebhookChannelStatusUpdateInputSchema = z.object({
  status: inboundWebhookMutableChannelStatusSchema,
});

export const inboundWebhookChannelRouteInputSchema = z.object({
  metaBusinessConnectionId: idSchema,
  metaReportingAccountId: idSchema.nullable().optional(),
  metaConversionDestinationId: idSchema.nullable().optional(),
});

export const inboundWebhookChannelRoutesUpdateInputSchema = z.object({
  routes: z.array(inboundWebhookChannelRouteInputSchema).max(100),
});

export const inboundWebhookParserReleaseSchema = z.object({
  id: idSchema,
  provider: inboundWebhookProviderSchema,
  version: parserVersionSchema,
  status: inboundWebhookParserReleaseStatusSchema,
  certifiedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const inboundWebhookConnectionSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  provider: inboundWebhookProviderSchema,
  displayName: inboundWebhookDisplayNameSchema,
  parserVersion: parserVersionSchema,
  parserReleaseStatus: inboundWebhookParserReleaseStatusSchema.optional(),
  status: inboundWebhookConnectionStatusSchema,
  lastDeliveryAt: dateTimeSchema.nullable(),
  lastSuccessfulParseAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const inboundWebhookConnectionListSchema = z.array(
  inboundWebhookConnectionSchema,
);

export const inboundWebhookConnectionCreateResultSchema = z.object({
  connection: inboundWebhookConnectionSchema,
  secret: oneTimeSecretSchema,
  webhookUrl: z.string().url(),
});

export const inboundWebhookConnectionRotateSecretResultSchema = z.object({
  connectionId: idSchema,
  secret: oneTimeSecretSchema,
  webhookUrl: z.string().url(),
  rotatedAt: dateTimeSchema,
});

export const inboundWebhookCapabilityProviderSchema = z.object({
  provider: inboundWebhookProviderSchema,
  parserVersion: parserVersionSchema,
  parserReleaseStatus: inboundWebhookParserReleaseStatusSchema.nullable(),
  creationEnabled: z.boolean(),
});

export const inboundWebhookCapabilitiesSchema = z.object({
  enabled: z.boolean(),
  providers: z.array(inboundWebhookCapabilityProviderSchema),
});

export const inboundWebhookObservationCountersSchema = z.object({
  eligibleRouted: z.number().int().nonnegative(),
  eligibleUnresolved: z.number().int().nonnegative(),
  ignoredNoCtwa: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});

export const inboundWebhookConnectionOverviewSchema = z.object({
  connection: inboundWebhookConnectionSchema,
  counters: inboundWebhookObservationCountersSchema,
});

export const backofficeInboundWebhookDeliveryQuerySchema = z.object({
  workspaceId: idSchema.optional(),
  connectionId: idSchema.optional(),
  provider: inboundWebhookProviderSchema.optional(),
  status: inboundWebhookDeliveryStatusSchema.optional(),
  classification: inboundWebhookEventClassificationSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const backofficeInboundWebhookDeliverySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  connectionId: idSchema,
  connectionName: inboundWebhookDisplayNameSchema,
  provider: inboundWebhookProviderSchema,
  providerEventType: z.string().trim().min(1).max(120).nullable(),
  parserVersion: parserVersionSchema,
  parserReleaseStatus: inboundWebhookParserReleaseStatusSchema,
  status: inboundWebhookDeliveryStatusSchema,
  classification: inboundWebhookEventClassificationSchema.nullable(),
  firstReceivedAt: dateTimeSchema,
  lastReceivedAt: dateTimeSchema,
  attemptCount: z.number().int().positive(),
  payloadAvailable: z.boolean(),
  payloadExpiresAt: dateTimeSchema,
  parseErrorCode: normalizedCodeSchema.nullable(),
  routingErrorCode: normalizedCodeSchema.nullable(),
  normalizedSummary: z.record(z.unknown()).nullable(),
  eventCount: z.number().int().nonnegative(),
});

export const backofficeInboundWebhookDeliveryListSchema = z.array(
  backofficeInboundWebhookDeliverySchema,
);

export const inboundWebhookChannelRouteSchema = z.object({
  id: idSchema,
  channelId: idSchema,
  metaBusinessConnectionId: idSchema.nullable(),
  metaReportingAccountId: idSchema.nullable(),
  metaConversionDestinationId: idSchema.nullable(),
  active: z.boolean(),
  validationStatus: normalizedCodeSchema,
  validationErrorCode: normalizedCodeSchema.nullable(),
  lastValidatedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const inboundWebhookChannelSchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  organizationId: idSchema,
  providerChannelId: idSchema,
  connectedPhone: z.string().trim().min(1).max(32),
  channelName: z.string().trim().min(1).max(160).nullable(),
  status: inboundWebhookChannelStatusSchema,
  firstSeenAt: dateTimeSchema,
  lastSeenAt: dateTimeSchema,
  routes: z.array(inboundWebhookChannelRouteSchema),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const inboundWebhookChannelListSchema = z.array(
  inboundWebhookChannelSchema,
);

export const inboundWebhookNormalizedObservationSchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  deliveryId: idSchema,
  channelId: idSchema,
  provider: inboundWebhookProviderSchema,
  providerEventType: z.string().trim().min(1).max(120).nullable(),
  externalMessageId: idSchema.nullable(),
  occurredAt: dateTimeSchema,
  connectedPhoneSuffix: z
    .string()
    .regex(/^\d{2,8}$/)
    .nullable(),
  contactIdentityHash: z.string().min(16).max(128).nullable(),
  adId: idSchema.nullable(),
  hasCtwa: z.boolean(),
  classification: inboundWebhookEventClassificationSchema,
  classificationReason: normalizedCodeSchema.nullable(),
  resolvedBusinessConnectionId: idSchema.nullable(),
  resolvedReportingAccountId: idSchema.nullable(),
  resolvedConversionDestinationId: idSchema.nullable(),
  createdAt: dateTimeSchema,
});

export const inboundWebhookNormalizedObservationListSchema = z.array(
  inboundWebhookNormalizedObservationSchema,
);

export const backofficeInboundWebhookPayloadSchema = z.object({
  delivery: backofficeInboundWebhookDeliverySchema,
  payload: z.record(z.unknown()).nullable(),
  events: inboundWebhookNormalizedObservationListSchema,
});

export type InboundWebhookProviderDto = z.infer<
  typeof inboundWebhookProviderSchema
>;
export type InboundWebhookParserReleaseStatusDto = z.infer<
  typeof inboundWebhookParserReleaseStatusSchema
>;
export type InboundWebhookConnectionStatusDto = z.infer<
  typeof inboundWebhookConnectionStatusSchema
>;
export type InboundWebhookMutableConnectionStatusDto = z.infer<
  typeof inboundWebhookMutableConnectionStatusSchema
>;
export type InboundWebhookChannelStatusDto = z.infer<
  typeof inboundWebhookChannelStatusSchema
>;
export type InboundWebhookMutableChannelStatusDto = z.infer<
  typeof inboundWebhookMutableChannelStatusSchema
>;
export type InboundWebhookDeliveryStatusDto = z.infer<
  typeof inboundWebhookDeliveryStatusSchema
>;
export type InboundWebhookEventClassificationDto = z.infer<
  typeof inboundWebhookEventClassificationSchema
>;
export type InboundWebhookConnectionCreateInputDto = z.infer<
  typeof inboundWebhookConnectionCreateInputSchema
>;
export type InboundWebhookConnectionStatusUpdateInputDto = z.infer<
  typeof inboundWebhookConnectionStatusUpdateInputSchema
>;
export type InboundWebhookChannelStatusUpdateInputDto = z.infer<
  typeof inboundWebhookChannelStatusUpdateInputSchema
>;
export type InboundWebhookChannelRouteInputDto = z.infer<
  typeof inboundWebhookChannelRouteInputSchema
>;
export type InboundWebhookChannelRoutesUpdateInputDto = z.infer<
  typeof inboundWebhookChannelRoutesUpdateInputSchema
>;
export type InboundWebhookParserReleaseDto = z.infer<
  typeof inboundWebhookParserReleaseSchema
>;
export type InboundWebhookConnectionDto = z.infer<
  typeof inboundWebhookConnectionSchema
>;
export type InboundWebhookConnectionListDto = z.infer<
  typeof inboundWebhookConnectionListSchema
>;
export type InboundWebhookConnectionCreateResultDto = z.infer<
  typeof inboundWebhookConnectionCreateResultSchema
>;
export type InboundWebhookConnectionRotateSecretResultDto = z.infer<
  typeof inboundWebhookConnectionRotateSecretResultSchema
>;
export type InboundWebhookCapabilityProviderDto = z.infer<
  typeof inboundWebhookCapabilityProviderSchema
>;
export type InboundWebhookCapabilitiesDto = z.infer<
  typeof inboundWebhookCapabilitiesSchema
>;
export type InboundWebhookObservationCountersDto = z.infer<
  typeof inboundWebhookObservationCountersSchema
>;
export type InboundWebhookConnectionOverviewDto = z.infer<
  typeof inboundWebhookConnectionOverviewSchema
>;
export type BackofficeInboundWebhookDeliveryQueryDto = z.infer<
  typeof backofficeInboundWebhookDeliveryQuerySchema
>;
export type BackofficeInboundWebhookDeliveryDto = z.infer<
  typeof backofficeInboundWebhookDeliverySchema
>;
export type BackofficeInboundWebhookDeliveryListDto = z.infer<
  typeof backofficeInboundWebhookDeliveryListSchema
>;
export type BackofficeInboundWebhookPayloadDto = z.infer<
  typeof backofficeInboundWebhookPayloadSchema
>;
export type InboundWebhookChannelRouteDto = z.infer<
  typeof inboundWebhookChannelRouteSchema
>;
export type InboundWebhookChannelDto = z.infer<
  typeof inboundWebhookChannelSchema
>;
export type InboundWebhookChannelListDto = z.infer<
  typeof inboundWebhookChannelListSchema
>;
export type InboundWebhookNormalizedObservationDto = z.infer<
  typeof inboundWebhookNormalizedObservationSchema
>;
export type InboundWebhookNormalizedObservationListDto = z.infer<
  typeof inboundWebhookNormalizedObservationListSchema
>;
