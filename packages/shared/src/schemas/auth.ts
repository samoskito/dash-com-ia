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

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type GoogleOAuthStartDto = z.infer<typeof googleOAuthStartSchema>;
