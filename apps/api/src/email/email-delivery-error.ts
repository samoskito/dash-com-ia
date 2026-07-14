export type EmailFailureKind = "transient" | "permanent";

export type ClassifiedEmailFailure = {
  kind: EmailFailureKind;
  code: string;
};

type SmtpLikeError = {
  code?: unknown;
  responseCode?: unknown;
};

export class EmailTransportFailure extends Error {
  constructor(
    public readonly failure: ClassifiedEmailFailure,
    message = "Transactional email transport failed",
  ) {
    super(message);
    this.name = "EmailTransportFailure";
  }
}

const permanentCodes = new Set([
  "EAUTH",
  "ECONFIG",
  "EENVELOPE",
  "EINVALIDPAYLOAD",
  "EMESSAGE",
  "EPROVIDERDISABLED",
  "ERECIPIENT",
]);

const transientCodes = new Set([
  "EAI_AGAIN",
  "ECONNECTION",
  "ECONNRESET",
  "EDNS",
  "EPIPE",
  "ESOCKET",
  "ETIMEDOUT",
]);

export function classifyEmailDeliveryError(
  error: unknown,
): ClassifiedEmailFailure {
  if (error instanceof EmailTransportFailure) {
    return error.failure;
  }

  const smtpError = isSmtpLikeError(error) ? error : {};
  const responseCode =
    typeof smtpError.responseCode === "number" ? smtpError.responseCode : null;
  const code = normalizeErrorCode(smtpError.code);

  if (responseCode !== null) {
    if (responseCode >= 500 && responseCode <= 599) {
      return { kind: "permanent", code: `SMTP_${responseCode}` };
    }

    if (responseCode >= 400 && responseCode <= 499) {
      return { kind: "transient", code: `SMTP_${responseCode}` };
    }
  }

  if (permanentCodes.has(code)) {
    return { kind: "permanent", code };
  }

  if (transientCodes.has(code)) {
    return { kind: "transient", code };
  }

  return { kind: "transient", code: "EUNKNOWN" };
}

function isSmtpLikeError(error: unknown): error is SmtpLikeError {
  return typeof error === "object" && error !== null;
}

function normalizeErrorCode(value: unknown): string {
  if (typeof value !== "string") {
    return "EUNKNOWN";
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 64);

  return normalized || "EUNKNOWN";
}
