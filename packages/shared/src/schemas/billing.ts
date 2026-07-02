import { z } from "zod";

export const whatsappInstanceQuoteSchema = z.object({
  workspaceId: z.string().min(1),
  activeInstances: z.number().int().nonnegative(),
  pricePerInstanceCents: z.number().int().positive(),
  nextInstanceAmountCents: z.number().int().positive(),
  currency: z.literal("BRL")
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

export type WhatsappInstanceQuoteDto = z.infer<
  typeof whatsappInstanceQuoteSchema
>;
export type WhatsappInstanceCheckoutInputDto = z.infer<
  typeof whatsappInstanceCheckoutInputSchema
>;
export type WhatsappInstanceCheckoutDto = z.infer<
  typeof whatsappInstanceCheckoutSchema
>;
export type SplitReceiverCreateInputDto = z.infer<
  typeof splitReceiverCreateInputSchema
>;
export type SplitReceiverUpdateInputDto = z.infer<
  typeof splitReceiverUpdateInputSchema
>;
export type SplitReceiverDto = z.infer<typeof splitReceiverSchema>;
