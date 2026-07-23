export function dateTimeInTimezone(
  dateTimeText: string,
  timezone: string,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTimeText);

  if (!match) {
    throw new Error("Invalid local date time");
  }

  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
  );
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observed = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    const correction = target - observed;

    candidate += correction;

    if (correction === 0) {
      break;
    }
  }

  return new Date(candidate);
}

export function dateTimeRangeInTimezone(
  receivedFrom: string | undefined,
  receivedUntil: string | undefined,
  timezone: string,
): { gte?: Date; lte?: Date } {
  return {
    ...(receivedFrom
      ? { gte: dateTimeInTimezone(receivedFrom, timezone) }
      : {}),
    ...(receivedUntil
      ? {
          lte: new Date(
            dateTimeInTimezone(receivedUntil, timezone).getTime() + 59_999,
          ),
        }
      : {}),
  };
}
