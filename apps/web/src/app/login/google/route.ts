import { NextResponse } from "next/server";
import { apiBaseUrl } from "../../../lib/api";

type GoogleStartResult = {
  action: "configure_env" | "redirect";
  authorizationUrl: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (process.env.AUTH_GOOGLE_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.redirect(new URL("/login?error=google_disabled", url));
  }

  const redirectTo = url.searchParams.get("redirectTo") ?? "/overview";

  try {
    const response = await fetch(`${apiBaseUrl}/auth/google/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        redirectTo
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.redirect(new URL("/login?error=google", url));
    }

    const result = (await response.json()) as GoogleStartResult;

    if (result.action === "redirect" && result.authorizationUrl) {
      return NextResponse.redirect(result.authorizationUrl);
    }

    return NextResponse.redirect(new URL("/login?error=google_env", url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", url));
  }
}
