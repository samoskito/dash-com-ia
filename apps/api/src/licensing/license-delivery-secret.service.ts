import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";

export type LicenseDeliveryCiphertext = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

const HKDF_SALT = "wpptrack-license-delivery";
const HKDF_INFO = "license-delivery-artifact-v1";

/**
 * AES-256-GCM helper for the short-lived LicenseDeliveryArtifact row.
 * Key is HKDF-derived from LICENSE_DELIVERY_SECRET; the raw key never touches
 * the License table and this ciphertext is only ever decrypted for resend.
 */
@Injectable()
export class LicenseDeliverySecretService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  encrypt(licenseId: string, rawKey: string): LicenseDeliveryCiphertext {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(this.associatedData(licenseId));
    const ciphertext = Buffer.concat([
      cipher.update(rawKey, "utf8"),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(licenseId: string, artifact: LicenseDeliveryCiphertext): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(artifact.iv, "base64"),
    );
    decipher.setAAD(this.associatedData(licenseId));
    decipher.setAuthTag(Buffer.from(artifact.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(artifact.ciphertext, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  }

  private associatedData(licenseId: string): Buffer {
    return Buffer.from(`license-delivery-artifact-v1\n${licenseId}`, "utf8");
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
