/**
 * Shared user-safe PT-BR copy for the additive WhatsApp number flow. Kept in
 * a plain module (no "use server"/"use client" directive) so both the
 * server action and the client component can import the same constant
 * without violating Next.js's "use server" files may only export async
 * functions" rule.
 */
export const GENERIC_ERROR_MESSAGE =
  "Nao foi possivel adicionar o numero agora. Tente novamente em instantes.";
