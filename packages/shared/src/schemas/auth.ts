import { z } from "zod";

const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1)
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: normalizedEmailSchema,
  password: z.string().min(8)
});

export const googleOAuthStartSchema = z.object({
  redirectUri: z.string().trim().url().optional()
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type GoogleOAuthStartDto = z.infer<typeof googleOAuthStartSchema>;
