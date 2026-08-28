import { z } from "zod";

export const subscriptionPlanKinds = [
  "standard",
  "custom",
  "exempt",
  "legacy_protected",
] as const;

export const subscriptionPlanVisibilities = ["public", "private"] as const;

export const workspaceSubscriptionContractStatuses = [
  "draft",
  "awaiting_payment",
  "active",
  "past_due",
  "grace_period",
  "cancel_at_period_end",
  "suspended",
  "canceled",
  "exempt",
  "legacy_protected",
] as const;

export const subscriptionPaymentMethods = [
  "unknown",
  "credit_card",
  "pix",
] as const;

export const whatsappSeatStatuses = [
  "reserved",
  "active",
  "suspended",
  "released",
] as const;

export const whatsappSeatProviders = [
  "uazapi",
  "cloud_api",
  "umbler",
  "gupshup",
] as const;

export const workspaceBillingProfileStatuses = [
  "incomplete",
  "valid",
  "invalid",
] as const;

export const billingInvoiceStatuses = [
  "not_configured",
  "pending_configuration",
  "scheduled",
  "issued",
  "authorized",
  "canceled",
  "failed",
  "rejected",
] as const;

export const subscriptionPlanKindSchema = z.enum(subscriptionPlanKinds);
export const subscriptionPlanVisibilitySchema = z.enum(
  subscriptionPlanVisibilities,
);
export const workspaceSubscriptionContractStatusSchema = z.enum(
  workspaceSubscriptionContractStatuses,
);
export const subscriptionPaymentMethodSchema = z.enum(
  subscriptionPaymentMethods,
);
export const whatsappSeatStatusSchema = z.enum(whatsappSeatStatuses);
export const whatsappSeatProviderSchema = z.enum(whatsappSeatProviders);
export const workspaceBillingProfileStatusSchema = z.enum(
  workspaceBillingProfileStatuses,
);
export const billingInvoiceStatusSchema = z.enum(billingInvoiceStatuses);

export const whatsappPackagePlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  kind: subscriptionPlanKindSchema,
  visibility: subscriptionPlanVisibilitySchema,
  monthlyPriceCents: z.number().int().nonnegative(),
  includedWhatsappNumbers: z.number().int().positive(),
  version: z.number().int().positive(),
  active: z.boolean(),
});

const whatsappPackagePlanCreateInputBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: subscriptionPlanKindSchema,
  visibility: subscriptionPlanVisibilitySchema,
  monthlyPriceCents: z.number().int().nonnegative(),
  includedWhatsappNumbers: z.number().int().positive(),
  active: z.boolean().default(true),
  reason: z.string().trim().min(3).max(500),
});

export const whatsappPackagePlanCreateInputSchema =
  whatsappPackagePlanCreateInputBaseSchema.superRefine((input, context) => {
    if (input.kind === "exempt" && input.monthlyPriceCents !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plano isento deve ter mensalidade zero",
        path: ["monthlyPriceCents"],
      });
    }

    if (
      ["custom", "exempt", "legacy_protected"].includes(input.kind) &&
      input.visibility !== "private"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planos especiais devem ser privados",
        path: ["visibility"],
      });
    }
  });

export const whatsappPackagePlanUpdateInputSchema =
  whatsappPackagePlanCreateInputBaseSchema
    .omit({ slug: true, kind: true })
    .partial()
    .required({ reason: true })
    .refine((input) => Object.keys(input).some((key) => key !== "reason"), {
      message: "Informe ao menos um campo comercial para atualizar",
    });

export const workspacePackageAssignmentInputSchema = z.object({
  planId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const workspacePackageAssignmentSchema = z.object({
  workspaceId: z.string().min(1),
  subscriptionId: z.string().min(1),
  status: workspaceSubscriptionContractStatusSchema,
  plan: whatsappPackagePlanSchema,
  assignedAt: z.string().datetime(),
});

export const workspaceBillingProfileInputSchema = z.object({
  payerType: z.enum(["individual", "company"]),
  payerName: z.string().trim().min(2).max(180),
  taxId: z.string().trim().min(11).max(18),
  billingEmail: z.string().trim().email(),
  phone: z.string().trim().min(10).max(24),
  postalCode: z.string().trim().min(8).max(10),
  addressLine: z.string().trim().min(2).max(180),
  addressNumber: z.string().trim().min(1).max(30),
  addressComplement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().length(2),
});

export const workspaceBillingProfileSchema =
  workspaceBillingProfileInputSchema.extend({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    status: workspaceBillingProfileStatusSchema,
    asaasCustomerId: z.string().min(1).nullable(),
    validatedAt: z.string().datetime().nullable(),
    validationErrorCode: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  });

export const workspacePackageSubscriptionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  planId: z.string().min(1).nullable(),
  status: workspaceSubscriptionContractStatusSchema,
  planName: z.string().min(1),
  planVersion: z.number().int().positive(),
  monthlyPriceCents: z.number().int().nonnegative(),
  includedWhatsappNumbers: z.number().int().positive(),
  occupiedWhatsappNumbers: z.number().int().nonnegative(),
  billingMethod: subscriptionPaymentMethodSchema,
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  graceEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  accessEndsAt: z.string().datetime().nullable(),
  fiscalStatus: billingInvoiceStatusSchema,
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        key: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        capacity: z.number().int().positive(),
        monthlyPriceCents: z.number().int().positive(),
        status: z.enum(["pending_payment", "active"]),
      }),
    )
    .default([]),
});

export const workspacePackageCheckoutInputSchema = z.object({
  planId: z.string().min(1),
});

// Idempotency is carried only by the required HTTP Idempotency-Key header.
// Unknown legacy body fields are stripped and can never supply the key.
export const workspaceAddWhatsappNumberInputSchema = z.object({});

export const workspaceAddWhatsappNumberSchema = z.object({
  subscriptionId: z.string().min(1),
  itemId: z.string().min(1),
  chargeId: z.string().min(1),
  addedCapacity: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  monthlyPriceCents: z.number().int().positive(),
  paymentAmountCents: z.number().int().positive(),
  checkoutUrl: z.string().url(),
  externalPaymentId: z.string().min(1),
  status: z.enum(["awaiting_payment", "active"]),
});

export const workspacePackageCheckoutSchema = z.object({
  workspaceId: z.string().min(1),
  subscriptionId: z.string().min(1),
  checkoutId: z.string().min(1),
  checkoutUrl: z.string().url(),
  status: z.literal("awaiting_payment"),
});

export const workspaceSubscriptionCancellationInputSchema = z.object({
  confirmation: z.literal(true),
  reason: z.string().trim().min(2).max(500).nullable().optional(),
});

export const workspaceSubscriptionCancellationSchema = z.object({
  workspaceId: z.string().min(1),
  subscriptionId: z.string().min(1),
  status: workspaceSubscriptionContractStatusSchema,
  requestedAt: z.string().datetime(),
  accessEndsAt: z.string().datetime().nullable(),
});

export const whatsappSeatSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    provider: whatsappSeatProviderSchema,
    status: whatsappSeatStatusSchema,
    normalizedPhone: z.string().min(1).nullable(),
    whatsappInstanceId: z.string().min(1).nullable(),
    inboundWebhookChannelId: z.string().min(1).nullable(),
    reservationExpiresAt: z.string().datetime().nullable(),
    activatedAt: z.string().datetime().nullable(),
    suspendedAt: z.string().datetime().nullable(),
    releasedAt: z.string().datetime().nullable(),
  })
  .refine(
    (seat) =>
      Number(seat.whatsappInstanceId !== null) +
        Number(seat.inboundWebhookChannelId !== null) ===
      1,
    {
      message: "Informe exatamente um recurso de WhatsApp para a vaga",
      path: ["whatsappInstanceId"],
    },
  );

export const billingInvoiceSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  subscriptionId: z.string().min(1),
  paymentChargeId: z.string().min(1).nullable(),
  providerInvoiceId: z.string().min(1).nullable(),
  providerPaymentId: z.string().min(1).nullable(),
  status: billingInvoiceStatusSchema,
  amountCents: z.number().int().nonnegative().nullable(),
  issuedAt: z.string().datetime().nullable(),
  authorizedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().min(1).nullable(),
  lastAttemptAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const platformFiscalSettingsInputBaseSchema = z.object({
  enabled: z.boolean(),
  municipalServiceId: z.string().trim().min(1).max(120).nullable(),
  municipalServiceCode: z.string().trim().min(1).max(120).nullable(),
  serviceDescription: z.string().trim().min(3).max(500),
  observations: z.string().trim().max(1000).nullable(),
  taxes: z.record(z.string(), z.number().nonnegative()).nullable(),
  validationReason: z.string().trim().min(3).max(500),
});

export const platformFiscalSettingsInputSchema =
  platformFiscalSettingsInputBaseSchema.superRefine((input, context) => {
    if (
      input.enabled &&
      !input.municipalServiceId &&
      !input.municipalServiceCode
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o servico municipal por ID ou codigo",
        path: ["municipalServiceId"],
      });
    }
  });

export const platformFiscalSettingsSchema =
  platformFiscalSettingsInputBaseSchema
    .omit({ validationReason: true })
    .extend({
      effectiveDatePeriod: z.literal("ON_PAYMENT_CONFIRMATION"),
      validatedAt: z.string().datetime().nullable(),
      updatedAt: z.string().datetime(),
    });

export const backofficeContractFiltersSchema = z.object({
  workspaceId: z.string().trim().min(1).optional(),
  status: workspaceSubscriptionContractStatusSchema.optional(),
});

export const legacyBillingBackfillConfirmation =
  "APLICAR LEGADO PROTEGIDO" as const;

export const legacyBillingBackfillIssueSchema = z.object({
  severity: z.enum(["warning", "blocking"]),
  code: z.string().min(1),
  message: z.string().min(1),
  resourceIds: z.array(z.string().min(1)).default([]),
});

export const legacyBillingBackfillWorkspaceSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  currentContractId: z.string().min(1).nullable(),
  currentContractStatus: workspaceSubscriptionContractStatusSchema.nullable(),
  activeInstances: z.number().int().nonnegative(),
  externalChannels: z.number().int().nonnegative(),
  targetCapacity: z.number().int().nonnegative(),
  existingSeats: z.number().int().nonnegative(),
  missingSeats: z.number().int().nonnegative(),
  orphanedSeats: z.number().int().nonnegative(),
  protected: z.boolean(),
  eligible: z.boolean(),
  issues: z.array(legacyBillingBackfillIssueSchema),
});

export const legacyBillingBackfillReportSchema = z.object({
  generatedAt: z.string().datetime(),
  applyEnabled: z.boolean(),
  confirmationPhrase: z.literal(legacyBillingBackfillConfirmation),
  summary: z.object({
    workspaces: z.number().int().nonnegative(),
    eligibleWorkspaces: z.number().int().nonnegative(),
    protectedWorkspaces: z.number().int().nonnegative(),
    totalResources: z.number().int().nonnegative(),
    activeInstances: z.number().int().nonnegative(),
    externalChannels: z.number().int().nonnegative(),
    existingSeats: z.number().int().nonnegative(),
    missingSeats: z.number().int().nonnegative(),
    orphanedSeats: z.number().int().nonnegative(),
    blockingIssues: z.number().int().nonnegative(),
  }),
  workspaces: z.array(legacyBillingBackfillWorkspaceSchema),
});

export const legacyBillingBackfillApplyInputSchema = z.object({
  confirmation: z.literal(legacyBillingBackfillConfirmation),
  reason: z.string().trim().min(10).max(500),
  workspaceIds: z.array(z.string().min(1)).max(250).optional(),
});

export const legacyBillingBackfillApplyResultSchema = z.object({
  appliedWorkspaces: z.number().int().nonnegative(),
  skippedWorkspaces: z.number().int().nonnegative(),
  createdContracts: z.number().int().nonnegative(),
  updatedContracts: z.number().int().nonnegative(),
  createdSeats: z.number().int().nonnegative(),
  reboundSeats: z.number().int().nonnegative(),
  report: legacyBillingBackfillReportSchema,
});

export const whatsappSeatReservationInputSchema = z
  .object({
    provider: whatsappSeatProviderSchema,
    normalizedPhone: z.string().trim().min(8).max(24).nullable().optional(),
    whatsappInstanceId: z.string().min(1).nullable().optional(),
    inboundWebhookChannelId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (input) =>
      Number(Boolean(input.whatsappInstanceId)) +
        Number(Boolean(input.inboundWebhookChannelId)) ===
      1,
    {
      message: "Informe exatamente um recurso de WhatsApp",
      path: ["whatsappInstanceId"],
    },
  );

export const uazapiPackageProvisionInputSchema = z.object({
  instanceName: z.string().trim().min(2).max(120),
});

export const uazapiPackageProvisionSchema = z.object({
  seat: whatsappSeatSchema,
  connection: z.object({
    whatsappInstanceId: z.string().min(1),
    provider: z.literal("uazapi"),
    billingStatus: z.literal("active"),
    connectionStatus: z.enum([
      "pending",
      "qr_required",
      "connected",
      "disconnected",
      "error",
    ]),
    qrCode: z.string().min(1).nullable(),
    connectedPhone: z.string().min(8).max(24).nullable().default(null),
    message: z.string().min(1).nullable(),
  }),
});

export const uazapiPackageInstanceRemovalInputSchema = z.object({
  confirmation: z.string().trim().min(2).max(120),
});

export const uazapiPackageInstanceRemovalSchema = z.object({
  whatsappInstanceId: z.string().min(1),
  instanceName: z.string().min(1),
  releasedSeatId: z.string().min(1).nullable(),
  removedAt: z.string().datetime(),
  providerAlreadyMissing: z.boolean(),
});

export const externalChannelBillingActionInputSchema = z.object({
  confirmation: z.literal(true),
  reason: z.string().trim().min(3).max(500).nullable().optional(),
});

export const workspacePackageBillingStateSchema = z.object({
  profile: workspaceBillingProfileSchema.nullable(),
  contract: workspacePackageSubscriptionSchema.nullable(),
  availablePlans: z.array(whatsappPackagePlanSchema),
  seats: z.object({
    capacity: z.number().int().nonnegative(),
    occupied: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    suspended: z.number().int().nonnegative(),
  }),
  invoices: z.array(billingInvoiceSchema),
  enforcementEnabled: z.boolean(),
  capabilities: z.object({
    packageBilling: z.boolean(),
    recurringCheckout: z.boolean(),
    lifecycle: z.boolean(),
    automaticInvoices: z.boolean(),
    uazapiProvisioning: z.boolean(),
    externalChannelEnforcement: z.boolean(),
  }),
});

export const workspacePackageAccessReasons = [
  "enforcement_disabled",
  "active_contract",
  "missing_contract",
  "contract_inactive",
  "access_expired",
] as const;

export const workspacePackageAccessReasonSchema = z.enum(
  workspacePackageAccessReasons,
);

export const workspacePackageAccessSchema = z.object({
  enforcementEnabled: z.boolean(),
  allowed: z.boolean(),
  reason: workspacePackageAccessReasonSchema,
  contractStatus: workspaceSubscriptionContractStatusSchema.nullable(),
  accessEndsAt: z.string().datetime().nullable(),
});

export const whatsappInstanceQuoteSchema = z.object({
  workspaceId: z.string().min(1),
  activeInstances: z.number().int().nonnegative(),
  pricePerInstanceCents: z.number().int().positive(),
  nextInstanceAmountCents: z.number().int().positive(),
  currency: z.literal("BRL"),
});

export const workspaceSubscriptionSummarySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum([
    "not_configured",
    "active",
    "pending",
    "overdue",
    "cancelled",
  ]),
  planName: z.string().min(1).nullable(),
  activeInstances: z.number().int().nonnegative(),
  pricePerWhatsappInstanceCents: z.number().int().positive(),
  monthlyAmountCents: z.number().int().nonnegative(),
  currentPeriodEnd: z.string().datetime().nullable(),
  asaasSubscriptionId: z.string().min(1).nullable(),
});

export const whatsappInstanceCheckoutInputSchema = z.object({
  instanceName: z.string().trim().min(2),
  provider: z.enum(["uazapi", "cloud_api"]).default("uazapi"),
});

export const whatsappInstanceCheckoutSchema = z.object({
  workspaceId: z.string().min(1),
  whatsappInstanceId: z.string().min(1),
  activationId: z.string().min(1),
  chargeId: z.string().min(1),
  status: z.literal("pending_payment"),
  amountCents: z.number().int().positive(),
  checkoutUrl: z.string().min(1).nullable(),
  paymentProvider: z.literal("asaas"),
  paymentProviderStatus: z.enum(["not_configured", "created"]),
  externalChargeId: z.string().min(1).nullable(),
});

export const whatsappConnectionStatuses = [
  "not_configured",
  "pending",
  "qr_required",
  "connected",
  "disconnected",
  "error",
] as const;

export const whatsappInstanceConnectionSchema = z.object({
  whatsappInstanceId: z.string().min(1),
  provider: z.enum(["uazapi", "cloud_api"]),
  billingStatus: z.enum([
    "pending_payment",
    "active",
    "disconnected",
    "suspended",
    "error",
  ]),
  connectionStatus: z.enum(whatsappConnectionStatuses),
  providerStatusText: z.string().min(1).nullable().default(null),
  qrCode: z.string().min(1).nullable(),
  connectedPhone: z.string().min(8).max(24).nullable().default(null),
  message: z.string().min(1).nullable(),
});

export const whatsappInstanceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(["uazapi", "cloud_api"]),
  billingStatus: z.enum([
    "pending_payment",
    "active",
    "disconnected",
    "suspended",
    "error",
  ]),
  providerInstanceId: z.string().min(1).nullable(),
  checkoutUrl: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
});

export const whatsappInstanceSummaryListSchema = z.array(
  whatsappInstanceSummarySchema,
);

export const splitReceiverCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  walletId: z.string().trim().min(3).max(120),
  email: z.string().trim().email().nullable().optional(),
  percentageBps: z.number().int().min(0).max(10000),
  active: z.boolean().default(true),
});

export const splitReceiverUpdateInputSchema = splitReceiverCreateInputSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export const splitReceiverSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  walletId: z.string().min(1),
  email: z.string().nullable(),
  percentageBps: z.number().int().min(0).max(10000),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const splitReceiverListSchema = z.array(splitReceiverSchema);

export const backofficePaymentChargeSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  provider: z.string().min(1),
  externalChargeId: z.string().min(1).nullable(),
  status: z.enum(["pending", "paid", "failed", "canceled", "expired"]),
  amountCents: z.number().int().nonnegative(),
  description: z.string().min(1),
  checkoutUrl: z.string().min(1).nullable(),
  dueAt: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  whatsappInstanceId: z.string().min(1).nullable(),
  whatsappInstanceName: z.string().min(1).nullable(),
});

export const backofficePaymentChargeListSchema = z.array(
  backofficePaymentChargeSchema,
);

export const backofficeSubscriptionPlanCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  pricePerWhatsappInstanceCents: z.number().int().positive(),
  active: z.boolean().default(true),
});

export const backofficeSubscriptionPlanUpdateInputSchema =
  backofficeSubscriptionPlanCreateInputSchema
    .partial()
    .refine((input) => Object.keys(input).length > 0, {
      message: "Informe ao menos um campo para atualizar",
    });

export const backofficeSubscriptionPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  pricePerWhatsappInstanceCents: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const backofficeSubscriptionPlanListSchema = z.array(
  backofficeSubscriptionPlanSchema,
);

export const backofficeWhatsappInstanceSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(["uazapi", "cloud_api"]),
  billingStatus: z.enum([
    "pending_payment",
    "active",
    "disconnected",
    "suspended",
    "error",
  ]),
  providerInstanceId: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const backofficeWhatsappInstanceListSchema = z.array(
  backofficeWhatsappInstanceSchema,
);

export type WhatsappInstanceQuoteDto = z.infer<
  typeof whatsappInstanceQuoteSchema
>;
export type SubscriptionPlanKind = z.infer<typeof subscriptionPlanKindSchema>;
export type SubscriptionPlanVisibility = z.infer<
  typeof subscriptionPlanVisibilitySchema
>;
export type WorkspaceSubscriptionContractStatus = z.infer<
  typeof workspaceSubscriptionContractStatusSchema
>;
export type SubscriptionPaymentMethod = z.infer<
  typeof subscriptionPaymentMethodSchema
>;
export type WhatsappSeatStatus = z.infer<typeof whatsappSeatStatusSchema>;
export type WhatsappSeatProvider = z.infer<typeof whatsappSeatProviderSchema>;
export type WorkspaceBillingProfileStatus = z.infer<
  typeof workspaceBillingProfileStatusSchema
>;
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;
export type WhatsappPackagePlanDto = z.infer<typeof whatsappPackagePlanSchema>;
export type WhatsappPackagePlanCreateInputDto = z.infer<
  typeof whatsappPackagePlanCreateInputSchema
>;
export type WhatsappPackagePlanUpdateInputDto = z.infer<
  typeof whatsappPackagePlanUpdateInputSchema
>;
export type WorkspacePackageAssignmentInputDto = z.infer<
  typeof workspacePackageAssignmentInputSchema
>;
export type WorkspacePackageAssignmentDto = z.infer<
  typeof workspacePackageAssignmentSchema
>;
export type WorkspaceBillingProfileInputDto = z.infer<
  typeof workspaceBillingProfileInputSchema
>;
export type WorkspaceBillingProfileDto = z.infer<
  typeof workspaceBillingProfileSchema
>;
export type WorkspacePackageSubscriptionDto = z.infer<
  typeof workspacePackageSubscriptionSchema
>;
export type WorkspacePackageCheckoutInputDto = z.infer<
  typeof workspacePackageCheckoutInputSchema
>;
export type WorkspacePackageCheckoutDto = z.infer<
  typeof workspacePackageCheckoutSchema
>;
export type WorkspaceAddWhatsappNumberInputDto = z.infer<
  typeof workspaceAddWhatsappNumberInputSchema
>;
export type WorkspaceAddWhatsappNumberDto = z.infer<
  typeof workspaceAddWhatsappNumberSchema
>;
export type WorkspaceSubscriptionCancellationInputDto = z.infer<
  typeof workspaceSubscriptionCancellationInputSchema
>;
export type WorkspaceSubscriptionCancellationDto = z.infer<
  typeof workspaceSubscriptionCancellationSchema
>;
export type WhatsappSeatDto = z.infer<typeof whatsappSeatSchema>;
export type BillingInvoiceDto = z.infer<typeof billingInvoiceSchema>;
export type PlatformFiscalSettingsInputDto = z.infer<
  typeof platformFiscalSettingsInputSchema
>;
export type PlatformFiscalSettingsDto = z.infer<
  typeof platformFiscalSettingsSchema
>;
export type LegacyBillingBackfillIssueDto = z.infer<
  typeof legacyBillingBackfillIssueSchema
>;
export type LegacyBillingBackfillWorkspaceDto = z.infer<
  typeof legacyBillingBackfillWorkspaceSchema
>;
export type LegacyBillingBackfillReportDto = z.infer<
  typeof legacyBillingBackfillReportSchema
>;
export type LegacyBillingBackfillApplyInputDto = z.infer<
  typeof legacyBillingBackfillApplyInputSchema
>;
export type LegacyBillingBackfillApplyResultDto = z.infer<
  typeof legacyBillingBackfillApplyResultSchema
>;
export type WhatsappSeatReservationInputDto = z.infer<
  typeof whatsappSeatReservationInputSchema
>;
export type UazapiPackageProvisionInputDto = z.infer<
  typeof uazapiPackageProvisionInputSchema
>;
export type UazapiPackageProvisionDto = z.infer<
  typeof uazapiPackageProvisionSchema
>;
export type UazapiPackageInstanceRemovalInputDto = z.infer<
  typeof uazapiPackageInstanceRemovalInputSchema
>;
export type UazapiPackageInstanceRemovalDto = z.infer<
  typeof uazapiPackageInstanceRemovalSchema
>;
export type ExternalChannelBillingActionInputDto = z.infer<
  typeof externalChannelBillingActionInputSchema
>;
export type WorkspacePackageBillingStateDto = z.infer<
  typeof workspacePackageBillingStateSchema
>;
export type WorkspacePackageAccessReason = z.infer<
  typeof workspacePackageAccessReasonSchema
>;
export type WorkspacePackageAccessDto = z.infer<
  typeof workspacePackageAccessSchema
>;
export type WorkspaceSubscriptionSummaryDto = z.infer<
  typeof workspaceSubscriptionSummarySchema
>;
export type WhatsappInstanceCheckoutInputDto = z.infer<
  typeof whatsappInstanceCheckoutInputSchema
>;
export type WhatsappInstanceCheckoutDto = z.infer<
  typeof whatsappInstanceCheckoutSchema
>;
export type WhatsappInstanceConnectionDto = z.infer<
  typeof whatsappInstanceConnectionSchema
>;
export type WhatsappInstanceSummaryDto = z.infer<
  typeof whatsappInstanceSummarySchema
>;
export type WhatsappInstanceSummaryListDto = z.infer<
  typeof whatsappInstanceSummaryListSchema
>;
export type SplitReceiverCreateInputDto = z.infer<
  typeof splitReceiverCreateInputSchema
>;
export type SplitReceiverUpdateInputDto = z.infer<
  typeof splitReceiverUpdateInputSchema
>;
export type SplitReceiverDto = z.infer<typeof splitReceiverSchema>;
export type BackofficePaymentChargeDto = z.infer<
  typeof backofficePaymentChargeSchema
>;
export type BackofficeSubscriptionPlanCreateInputDto = z.infer<
  typeof backofficeSubscriptionPlanCreateInputSchema
>;
export type BackofficeSubscriptionPlanUpdateInputDto = z.infer<
  typeof backofficeSubscriptionPlanUpdateInputSchema
>;
export type BackofficeSubscriptionPlanDto = z.infer<
  typeof backofficeSubscriptionPlanSchema
>;
export type BackofficeWhatsappInstanceDto = z.infer<
  typeof backofficeWhatsappInstanceSchema
>;
