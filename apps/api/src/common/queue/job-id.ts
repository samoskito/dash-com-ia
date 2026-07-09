export function createBullJobId(
  ...segments: Array<string | number | null | undefined>
): string {
  return segments
    .filter((segment) => segment !== null && segment !== undefined)
    .map((segment) => String(segment).replaceAll(":", "_"))
    .join("_");
}
