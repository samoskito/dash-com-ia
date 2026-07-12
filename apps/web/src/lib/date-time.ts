export const displayTimeZone = "America/Sao_Paulo";

export function formatDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(value).toLocaleString("pt-BR", {
    ...options,
    timeZone: displayTimeZone
  });
}
