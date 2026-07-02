import { z } from "zod";

export const whatsappInstanceQuoteSchema = z.object({
  workspaceId: z.string().min(1),
  activeInstances: z.number().int().nonnegative(),
  pricePerInstanceCents: z.number().int().positive(),
  nextInstanceAmountCents: z.number().int().positive(),
  currency: z.literal("BRL")
});

export const workspaceSubscriptionSummarySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["not_configured", "active", "pending", "overdue", "cancelled"]),
  planName: z.string().min(1).nullable(),
  activeInstances: z.number().int().nonnegative(),
  pricePerWhatsappInstanceCents: z.number().int().positive(),
  monthlyAmountCents: z.number().int().nonnegative(),
  currentPeriodEnd: z.string().datetime().nullable(),
  asaasSubscriptionId: z.string().min(1).nullable()
});

export const whatsappInstanceCheckoutInputSchema = z.object({
  instanceName: z.string().trim().min(2),
  provider: z.enum(["uazapi", "cloud_api"]).default("uazapi")
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
  externalChargeId: z.string().min(1).nullable()
});

export const whatsappConnectionStatuses = [
  "not_configured",
  "pending",
  "qr_required",
  "connected",
  "disconnected",
  "error"
] as const;

export const whatsappInstanceConnectionSchema = z.object({
  whatsappInstanceId: z.string().min(1),
  provider: z.enum(["uazapi", "cloud_api"]),
  billingStatus: z.enum(["pending_payment", "active", "suspended", "cancelled"]),
  connectionStatus: z.enum(whatsappConnectionStatuses),
  qrCode: z.string().min(1).nullable(),
  message: z.string().min(1).nullable()
});

export const whatsappInstanceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(["uazapi", "cloud_api"]),
  billingStatus: z.enum(["pending_payment", "active", "suspended", "cancelled"]),
  providerInstanceId: z.string().min(1).nullable(),
  checkoutUrl: z.string().min(1).nullable(),
  createdAt: z.string().datetime()
});

export const whatsappInstanceSummaryListSchema = z.array(
  whatsappInstanceSummarySchema
);

export const splitReceiverCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  walletId: z.string().trim().min(3).max(120),
  email: z.string().trim().email().nullable().optional(),
  percentageBps: z.number().int().min(0).max(10000),
  active: z.boolean().default(true)
});

export const splitReceiverUpdateInputSchema =
  splitReceiverCreateInputSchema.partial().refine(
    (input) => Object.keys(input).length > 0,
    {
      message: "Informe ao menos um campo para atualizar"
    }
  );

export const splitReceiverSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  walletId: z.string().min(1),
  email: z.string().nullable(),
  percentageBps: z.number().int().min(0).max(10000),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
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
  whatsappInstanceName: z.string().min(1).nullable()
});

export const backofficePaymentChargeListSchema = z.array(
  backofficePaymentChargeSchema
);

export type WhatsappInstanceQuoteDto = z.infer<
  typeof whatsappInstanceQuoteSchema
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
