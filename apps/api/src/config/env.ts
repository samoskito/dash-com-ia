export function getApiPort(): number {
  const value = process.env.API_PORT ?? process.env.PORT ?? "3333";
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid API_PORT/PORT: ${value}`);
  }

  return parsed;
}
