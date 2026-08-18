import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";

const aad = Buffer.from("wpptrack:xmax-account:v1", "utf8");

export type EncryptedXmaxApiKey = {
  apiKeyEncrypted: string;
  apiKeyIv: string;
  apiKeyTag: string;
};

@Injectable()
export class XmaxCredentialEncryptionService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  getMissingEnv(): string[] {
    // Reuse Meta token key when dedicated key is absent (same AES-256-GCM pattern).
    if (
      this.env.XMAX_API_KEY_ENCRYPTION_KEY ||
      this.env.META_TOKEN_ENCRYPTION_KEY
    ) {
      return [];
    }
    return ["XMAX_API_KEY_ENCRYPTION_KEY"];
  }

  encrypt(apiKey: string): EncryptedXmaxApiKey {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([
      cipher.update(apiKey, "utf8"),
      cipher.final(),
    ]);

    return {
      apiKeyEncrypted: encrypted.toString("base64"),
      apiKeyIv: iv.toString("base64"),
      apiKeyTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(input: EncryptedXmaxApiKey): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.getKey(),
      Buffer.from(input.apiKeyIv, "base64"),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(input.apiKeyTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.apiKeyEncrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  hashWebhookSecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }

  matchesWebhookSecret(
    provided: string | undefined,
    expectedHash: string | null | undefined,
  ): boolean {
    if (!provided || !expectedHash) {
      return false;
    }
    const got = Buffer.from(this.hashWebhookSecret(provided), "utf8");
    const expected = Buffer.from(expectedHash, "utf8");
    if (got.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(got, expected);
  }

  private getKey(): Buffer {
    const value =
      this.env.XMAX_API_KEY_ENCRYPTION_KEY ||
      this.env.META_TOKEN_ENCRYPTION_KEY;
    if (!value) {
      throw new Error("Missing XMAX_API_KEY_ENCRYPTION_KEY");
    }
    return createHash("sha256").update(value).digest();
  }
}
