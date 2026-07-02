import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "../../../../lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (since) {
    params.set("since", since);
  }

  if (until) {
    params.set("until", until);
  }

  const query = params.toString();
  const response = await fetch(
    `${apiBaseUrl}/reports/campaigns/export.csv${query ? `?${query}` : ""}`,
    {
      credentials: "include",
      headers: {
        ...(await cookieHeader())
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: "Nao foi possivel exportar relatorios" },
      { status: response.status }
    );
  }

  return new Response(await response.text(), {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "text/csv; charset=utf-8",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ??
        'attachment; filename="wpptrack-campanhas.csv"'
    }
  });
}

async function cookieHeader(): Promise<Record<string, string>> {
  try {
    const value = (await cookies()).toString();

    return value ? { Cookie: value } : {};
  } catch {
    return {};
  }
}
