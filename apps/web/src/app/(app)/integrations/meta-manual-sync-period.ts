export const initialManualMetaSyncLookbackDays = 90;

export function initialManualMetaSyncPeriod(now = new Date()): {
  since: string;
  until: string;
} {
  const until = dateOnlyInReportTimezone(now);
  const sinceDate = new Date(`${until}T12:00:00.000Z`);
  sinceDate.setUTCDate(
    sinceDate.getUTCDate() - (initialManualMetaSyncLookbackDays - 1),
  );

  return {
    since: dateOnlyInReportTimezone(sinceDate),
    until,
  };
}

function dateOnlyInReportTimezone(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.WPPTRACK_REPORT_TIMEZONE ?? "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}
