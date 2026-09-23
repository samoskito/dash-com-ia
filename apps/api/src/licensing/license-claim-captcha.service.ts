import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  RUNTIME_ENV,
  RUNTIME_FETCH,
  type RuntimeEnv,
  type RuntimeFetch,
} from "../common/runtime/runtime.module";
import { readLicenseClaimConfig } from "./license-claim.config";

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: unknown;
};

@Injectable()
export class LicenseClaimCaptchaService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
    @Optional()
    @Inject(RUNTIME_FETCH)
    private readonly fetchImpl: RuntimeFetch = fetch,
  ) {}

  async verify(rawToken: unknown, remoteIp?: string): Promise<boolean> {
    const secret = readLicenseClaimConfig(this.env).turnstileSecret;
    if (!secret) {
      return true;
    }

    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    if (!token) {
      return false;
    }

    const body = new URLSearchParams({
      secret,
      response: token,
    });
    if (remoteIp?.trim() && remoteIp !== "unknown") {
      body.set("remoteip", remoteIp.trim());
    }

    try {
      const response = await this.fetchImpl(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as TurnstileResponse;
      return payload.success === true;
    } catch {
      return false;
    }
  }
}
