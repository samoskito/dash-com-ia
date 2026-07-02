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

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type GoogleOAuthStartDto = z.infer<typeof googleOAuthStartSchema>;
export type GoogleOAuthStartResultDto = z.infer<
  typeof googleOAuthStartResultSchema
>;
