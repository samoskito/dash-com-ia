import { z } from "zod";

export const inboundWebhookProviders = ["umbler", "gupshup"] as const;
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
export const inboundWebhookReplayStatuses = [
  "queued",
  "processing",
  "completed",
  "completed_with_failures",
  "failed",
] as const;
export const inboundWebhookReplayItemStatuses = [
  "queued",
  "processing",
  "materialized",
  "duplicate",
  "skipped",
  "failed",
] as const;
export const inboundWebhookReplaySelections = [
  "canary_1",
  "canary_5",
  "canary_10",
  "remaining",
] as const;
export const inboundWebhookChannelReadinessStates = [
  "waiting",
  "blocked",
  "partial",
  "ready",
  "complete",
] as const;
export const inboundWebhookChannelReadinessBlockers = [
  "connection_paused",
  "channel_paused",
  "route_not_configured",
  "route_not_valid",
  "ctwa_not_observed",
  "ctwa_unresolved",
  "payload_unavailable",
  "payload_expiring_soon",
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
export const inboundWebhookReplayStatusSchema = z.enum(
  inboundWebhookReplayStatuses,
);
export const inboundWebhookReplayItemStatusSchema = z.enum(
  inboundWebhookReplayItemStatuses,
);
export const inboundWebhookReplaySelectionSchema = z.enum(
  inboundWebhookReplaySelections,
);
export const inboundWebhookChannelReadinessStateSchema = z.enum(
  inboundWebhookChannelReadinessStates,
);
export const inboundWebhookChannelReadinessBlockerSchema = z.enum(
  inboundWebhookChannelReadinessBlockers,
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
  provider: inboundWebhookProviderSchema,
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

export const backofficeInboundWebhookDeliverySummaryQuerySchema =
  backofficeInboundWebhookDeliveryQuerySchema.pick({
    workspaceId: true,
    connectionId: true,
    provider: true,
  });

export const backofficeInboundWebhookDeliverySummarySchema = z.object({
  all: z.number().int().nonnegative(),
  ctwaPending: z.number().int().nonnegative(),
  ctwaRouted: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  noCtwa: z.number().int().nonnegative(),
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

export const inboundWebhookChannelReadinessSchema = z.object({
  state: inboundWebhookChannelReadinessStateSchema,
  blockers: z.array(inboundWebhookChannelReadinessBlockerSchema),
  routeCount: z.number().int().nonnegative(),
  validRouteCount: z.number().int().nonnegative(),
  totalCtwa: z.number().int().nonnegative(),
  routedCtwa: z.number().int().nonnegative(),
  unresolvedCtwa: z.number().int().nonnegative(),
  retainedCtwa: z.number().int().nonnegative(),
  retainedRoutedCtwa: z.number().int().nonnegative(),
  payloadUnavailableCtwa: z.number().int().nonnegative(),
  alreadyMaterializedCtwa: z.number().int().nonnegative(),
  nextPayloadExpiresAt: dateTimeSchema.nullable(),
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
  readiness: inboundWebhookChannelReadinessSchema,
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

export const backofficeInboundWebhookReplayConfirmationInputSchema = z.object({
  confirmation: inboundWebhookDisplayNameSchema,
  selection: inboundWebhookReplaySelectionSchema.default("canary_1"),
  channelId: idSchema,
});

export const backofficeInboundWebhookReplayRetryInputSchema = z.object({
  confirmation: inboundWebhookDisplayNameSchema,
});

export const backofficeInboundWebhookReplayBatchSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  connectionId: idSchema,
  channelId: idSchema.nullable(),
  requestedByUserId: idSchema,
  selection: inboundWebhookReplaySelectionSchema,
  requestedLimit: z.number().int().min(1).max(500),
  status: inboundWebhookReplayStatusSchema,
  totalItems: z.number().int().nonnegative(),
  materializedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  retryableFailedCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  startedAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  lastRetriedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const backofficeInboundWebhookReplayChannelSchema = z.object({
  id: idSchema,
  displayName: inboundWebhookDisplayNameSchema,
  connectedPhone: z.string().min(1).nullable(),
  totalCtwa: z.number().int().nonnegative(),
  routeResolved: z.number().int().nonnegative(),
  routeUnresolved: z.number().int().nonnegative(),
  payloadAvailable: z.number().int().nonnegative(),
  alreadyMaterialized: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
});

export const backofficeInboundWebhookReplayPreviewSchema = z.object({
  connection: inboundWebhookConnectionSchema,
  parserRelease: inboundWebhookParserReleaseSchema,
  replayEnabled: z.boolean(),
  counts: z.object({
    totalCtwa: z.number().int().nonnegative(),
    routeResolved: z.number().int().nonnegative(),
    routeUnresolved: z.number().int().nonnegative(),
    payloadAvailable: z.number().int().nonnegative(),
    payloadExpired: z.number().int().nonnegative(),
    payloadUnavailable: z.number().int().nonnegative(),
    alreadyMaterialized: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
  }),
  oldestOccurredAt: dateTimeSchema.nullable(),
  newestOccurredAt: dateTimeSchema.nullable(),
  nextPayloadExpiresAt: dateTimeSchema.nullable(),
  channels: z.array(backofficeInboundWebhookReplayChannelSchema),
  latestBatch: backofficeInboundWebhookReplayBatchSchema.nullable(),
  recentBatches: z.array(backofficeInboundWebhookReplayBatchSchema).max(10),
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
export type InboundWebhookReplayStatusDto = z.infer<
  typeof inboundWebhookReplayStatusSchema
>;
export type InboundWebhookReplayItemStatusDto = z.infer<
  typeof inboundWebhookReplayItemStatusSchema
>;
export type InboundWebhookReplaySelectionDto = z.infer<
  typeof inboundWebhookReplaySelectionSchema
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
export type BackofficeInboundWebhookDeliverySummaryQueryDto = z.infer<
  typeof backofficeInboundWebhookDeliverySummaryQuerySchema
>;
export type BackofficeInboundWebhookDeliverySummaryDto = z.infer<
  typeof backofficeInboundWebhookDeliverySummarySchema
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
export type InboundWebhookChannelReadinessStateDto = z.infer<
  typeof inboundWebhookChannelReadinessStateSchema
>;
export type InboundWebhookChannelReadinessBlockerDto = z.infer<
  typeof inboundWebhookChannelReadinessBlockerSchema
>;
export type InboundWebhookChannelReadinessDto = z.infer<
  typeof inboundWebhookChannelReadinessSchema
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
export type BackofficeInboundWebhookReplayConfirmationInputDto = z.infer<
  typeof backofficeInboundWebhookReplayConfirmationInputSchema
>;
export type BackofficeInboundWebhookReplayRetryInputDto = z.infer<
  typeof backofficeInboundWebhookReplayRetryInputSchema
>;
export type BackofficeInboundWebhookReplayBatchDto = z.infer<
  typeof backofficeInboundWebhookReplayBatchSchema
>;
export type BackofficeInboundWebhookReplayChannelDto = z.infer<
  typeof backofficeInboundWebhookReplayChannelSchema
>;
export type BackofficeInboundWebhookReplayPreviewDto = z.infer<
  typeof backofficeInboundWebhookReplayPreviewSchema
>;
