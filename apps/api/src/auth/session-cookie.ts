import type { RuntimeEnv } from "../common/runtime/runtime.module";
import type { AuthSessionResult } from "./auth.service";

const sessionCookieName = "wpptrack_session";

export type SessionCookieResponse = {
  cookie: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
      expires: Date;
      path: string;
      domain?: string;
    },
  ) => void;
  clearCookie: (
    name: string,
    options: { path: string; domain?: string },
  ) => void;
};

export function setSessionCookie(
  response: SessionCookieResponse,
  session: AuthSessionResult,
  env: RuntimeEnv,
): void {
  response.cookie(sessionCookieName, session.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
    ...sharedCookieDomainOption(env),
  });

  if (sharedCookieDomainOption(env).domain) {
    response.clearCookie(sessionCookieName, { path: "/" });
  }
}

export function clearSessionCookies(
  response: SessionCookieResponse,
  env: RuntimeEnv,
): void {
  response.clearCookie(sessionCookieName, {
    path: "/",
    ...sharedCookieDomainOption(env),
  });

  if (sharedCookieDomainOption(env).domain) {
    response.clearCookie(sessionCookieName, { path: "/" });
  }
}

function sharedCookieDomainOption(env: RuntimeEnv): { domain?: string } {
  const domain = env.AUTH_COOKIE_DOMAIN?.trim();

  return domain ? { domain } : {};
}
