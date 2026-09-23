import {
  createHmac,
  hkdfSync,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";

const CODE_UPPER_BOUND = 1_000_000;
const CODE_LENGTH = 6;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const HKDF_SALT = "wpptrack-license-claim";
const HKDF_INFO = "license-claim-code-v1";

@Injectable()
export class LicenseClaimCodeService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  generate(): string {
    return randomInt(0, CODE_UPPER_BOUND).toString().padStart(CODE_LENGTH, "0");
  }

  hash(claimId: string, code: string): string {
    return createHmac("sha256", this.key())
      .update(`${claimId}:${code}`, "utf8")
      .digest("hex");
  }

  verify(claimId: string, code: string, storedHash: string | null): boolean {
    if (!storedHash || !SHA256_HEX_PATTERN.test(storedHash)) {
      return false;
    }

    const expected = Buffer.from(this.hash(claimId, code), "hex");
    const stored = Buffer.from(storedHash, "hex");
    return expected.length === stored.length && timingSafeEqual(expected, stored);
  }

  private key(): Buffer {
    const secret = this.env.LICENSE_DELIVERY_SECRET?.trim();
    if (!secret) {
      throw new Error("Missing LICENSE_DELIVERY_SECRET");
    }

    return Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secret, "utf8"),
        Buffer.from(HKDF_SALT, "utf8"),
        Buffer.from(HKDF_INFO, "utf8"),
        32,
      ),
    );
  }
}
