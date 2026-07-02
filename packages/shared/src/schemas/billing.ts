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
  checkoutUrl: z.string().min(1).nullable()
});

export type WhatsappInstanceQuoteDto = z.infer<
  typeof whatsappInstanceQuoteSchema
>;
export type WhatsappInstanceCheckoutInputDto = z.infer<
  typeof whatsappInstanceCheckoutInputSchema
>;
export type WhatsappInstanceCheckoutDto = z.infer<
  typeof whatsappInstanceCheckoutSchema
>;
