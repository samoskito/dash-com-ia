export function getApiPort(): number {
  const value = process.env.API_PORT ?? "3333";
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid API_PORT: ${value}`);
  }

  return parsed;
}
