import { z } from "zod";

const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8)
});

export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2),
  workspaceName: z.string().trim().min(2)
});

export const googleOAuthStartSchema = z.object({
  redirectTo: z.string().trim().min(1).optional()
});

export const googleOAuthStartResultSchema = z.object({
  provider: z.literal("google"),
  action: z.enum(["configure_env", "redirect"]),
  authorizationUrl: z.string().url().nullable(),
  missingEnv: z.array(z.string()),
  state: z.string().min(1).nullable()
});

export const googleOAuthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1)
});

export const googleOAuthCallbackResultSchema = z.object({
  provider: z.literal("google"),
  action: z.enum([
    "configure_env",
    "exchange_pending",
    "authenticated",
    "exchange_failed"
  ]),
  missingEnv: z.array(z.string()),
  codeReceived: z.literal(true),
  redirectTo: z.string().min(1),
  message: z.string().min(1).optional()
});

export const passwordResetRequestInputSchema = z.object({
  email: normalizedEmailSchema
});

export const authActionTokenDeliverySchema = z.enum([
  "email_queued",
  "not_configured"
]);

export const passwordResetRequestSchema = z.object({
  ok: z.literal(true),
  delivery: authActionTokenDeliverySchema,
  devToken: z.string().min(16).nullable()
});

export const passwordResetConfirmInputSchema = z.object({
  token: z.string().trim().min(16),
  password: z.string().min(8)
});

export const passwordResetConfirmSchema = z.object({
  ok: z.literal(true)
});

export const emailVerificationStartSchema = z.object({
  ok: z.literal(true),
  delivery: authActionTokenDeliverySchema,
  devToken: z.string().min(16).nullable()
});

export const emailVerificationConfirmInputSchema = z.object({
  token: z.string().trim().min(16)
});

export const emailVerificationConfirmSchema = z.object({
  ok: z.literal(true),
  emailVerifiedAt: z.string().datetime()
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type GoogleOAuthStartDto = z.infer<typeof googleOAuthStartSchema>;
export type GoogleOAuthStartResultDto = z.infer<
  typeof googleOAuthStartResultSchema
>;
export type GoogleOAuthCallbackQueryDto = z.infer<
  typeof googleOAuthCallbackQuerySchema
>;
export type GoogleOAuthCallbackResultDto = z.infer<
  typeof googleOAuthCallbackResultSchema
>;
export type PasswordResetRequestInputDto = z.infer<
  typeof passwordResetRequestInputSchema
>;
export type PasswordResetRequestDto = z.infer<
  typeof passwordResetRequestSchema
>;
export type PasswordResetConfirmInputDto = z.infer<
  typeof passwordResetConfirmInputSchema
>;
export type PasswordResetConfirmDto = z.infer<
  typeof passwordResetConfirmSchema
>;
export type EmailVerificationStartDto = z.infer<
  typeof emailVerificationStartSchema
>;
export type EmailVerificationConfirmInputDto = z.infer<
  typeof emailVerificationConfirmInputSchema
>;
export type EmailVerificationConfirmDto = z.infer<
  typeof emailVerificationConfirmSchema
>;
