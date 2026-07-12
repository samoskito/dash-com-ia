import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = [
  "/overview",
  "/leads",
  "/reports",
  "/events",
  "/integrations",
  "/settings",
  "/backoffice"
];

export function middleware(request: NextRequest) {
  const isProtected = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = request.cookies.get("wpptrack_session")?.value;

  if (session) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/overview/:path*",
    "/leads/:path*",
    "/reports/:path*",
    "/events/:path*",
    "/integrations/:path*",
    "/settings/:path*",
    "/backoffice/:path*"
  ]
};
