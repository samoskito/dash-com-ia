import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { IntegrationEnv } from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

export type EncryptedMetaToken = {
  encryptedAccessToken: string;
  tokenIv: string;
  tokenTag: string;
};

@Injectable()
export class MetaTokenEncryptionService {
  readonly currentKeyVersion = 1;

  constructor(
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
  ) {}

  getMissingEnv(): string[] {
    return this.env.META_TOKEN_ENCRYPTION_KEY
      ? []
      : ["META_TOKEN_ENCRYPTION_KEY"];
  }

  encrypt(accessToken: string): EncryptedMetaToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(accessToken, "utf8"),
      cipher.final(),
    ]);

    return {
      encryptedAccessToken: encrypted.toString("base64"),
      tokenIv: iv.toString("base64"),
      tokenTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(input: EncryptedMetaToken): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.getKey(),
      Buffer.from(input.tokenIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(input.tokenTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(input.encryptedAccessToken, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  fingerprint(accessToken: string): string {
    return createHash("sha256").update(accessToken).digest("hex");
  }

  tokenLast4(accessToken: string): string {
    return accessToken.slice(-4);
  }

  private getKey(): Buffer {
    const value = this.env.META_TOKEN_ENCRYPTION_KEY;

    if (!value) {
      throw new Error("Missing META_TOKEN_ENCRYPTION_KEY");
    }

    return createHash("sha256").update(value).digest();
  }
}
