import { apiBaseUrl } from "./api";

export type ClaimRequestResult =
  | { ok: true }
  | { ok: false; code: "rate_limited" | "disabled" | "network" };

export type ClaimConfirmResult =
  | {
      ok: true;
      status: "issued";
      licenseKey: string;
      accountIdentity: string;
      keyPrefix: string;
      expiresAt: string;
    }
  | { ok: true; status: "already_issued_contact_support" }
  | {
      ok: false;
      code: "code_invalid" | "in_progress" | "rate_limited" | "disabled" | "network";
    };

type ClaimErrorCode = Extract<ClaimConfirmResult, { ok: false }>["code"];

// Dedicated client: apiFetch drops the error body and sends cookies, and this
// public page needs the API `code` and must stay anonymous.
async function postClaim(
  path: "request" | "confirm",
  body: Record<string, string>,
): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/license/claim/${path}`, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  } catch {
    return null;
  }
}

function readString(body: unknown, field: string): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapErrorCode(status: number, body: unknown): ClaimErrorCode {
  switch (readString(body, "code")) {
    case "license_claim_code_invalid":
      return "code_invalid";
    case "license_claim_in_progress":
      return "in_progress";
    case "license_rate_limited":
      return "rate_limited";
    case "license_claim_disabled":
      return "disabled";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "network";
}

export async function requestClaimCode(
  email: string,
  captchaToken?: string,
): Promise<ClaimRequestResult> {
  const response = await postClaim(
    "request",
    captchaToken ? { email, captchaToken } : { email },
  );
  if (!response) {
    return { ok: false, code: "network" };
  }
  if (response.status >= 200 && response.status < 300) {
    return { ok: true };
  }
  const code = mapErrorCode(response.status, response.body);
  if (code === "rate_limited" || code === "disabled") {
    return { ok: false, code };
  }
  return { ok: false, code: "network" };
}

export async function confirmClaimCode(
  email: string,
  code: string,
): Promise<ClaimConfirmResult> {
  const response = await postClaim("confirm", { email, code });
  if (!response) {
    return { ok: false, code: "network" };
  }
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, code: mapErrorCode(response.status, response.body) };
  }

  const status = readString(response.body, "status");
  if (status === "already_issued_contact_support") {
    return { ok: true, status };
  }
  const licenseKey = readString(response.body, "licenseKey");
  const accountIdentity = readString(response.body, "accountIdentity");
  const keyPrefix = readString(response.body, "keyPrefix");
  const expiresAt = readString(response.body, "expiresAt");
  if (status === "issued" && licenseKey && accountIdentity && keyPrefix && expiresAt) {
    return { ok: true, status, licenseKey, accountIdentity, keyPrefix, expiresAt };
  }
  return { ok: false, code: "network" };
}
