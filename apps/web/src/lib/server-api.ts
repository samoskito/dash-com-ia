import { cookies } from "next/headers";
import { apiBaseUrl } from "./api";

export async function serverApiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  headers["Content-Type"] = headers["Content-Type"] ?? "application/json";

  const cookieHeader = await getCookieHeader();

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
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
