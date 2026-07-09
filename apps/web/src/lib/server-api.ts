import { cookies } from "next/headers";
import { apiBaseUrl } from "./api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export async function serverApiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const startedAt = Date.now();
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  headers["Content-Type"] = headers["Content-Type"] ?? "application/json";

  const cookieHeader = await getCookieHeader();

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers,
      cache: "no-store"
    });
  } catch (error) {
    logSlowApiRequest(path, Date.now() - startedAt, "network_error");
    throw error;
  }

  logSlowApiRequest(path, Date.now() - startedAt, response.status);

  if (!response.ok) {
    throw new ApiRequestError(await responseErrorMessage(response), response.status);
  }

  return (await response.json()) as T;
}

function logSlowApiRequest(
  path: string,
  durationMs: number,
  status: number | "network_error"
): void {
  const thresholdMs = Number(process.env.WPPTRACK_WEB_SLOW_REQUEST_MS ?? 1500);

  if (!Number.isFinite(thresholdMs) || durationMs < thresholdMs) {
    return;
  }

  console.warn("[wpptrack:web-api] slow request", {
    path,
    status,
    durationMs
  });
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    return `API request failed: ${response.status}`;
  }

  return `API request failed: ${response.status}`;
}

async function getCookieHeader(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.toString();

    return value || undefined;
  } catch {
    return undefined;
  }
}
