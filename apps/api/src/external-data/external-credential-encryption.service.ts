import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  externalMysqlCredentialsInputSchema,
  type ExternalMysqlCredentialsInputDto
} from "@wpptrack/shared";
import {
  RUNTIME_ENV,
  type RuntimeEnv
} from "../common/runtime/runtime.module";

const aad = Buffer.from("wpptrack:external-connector:v1", "utf8");

export type EncryptedExternalCredentials = {
  credentialsEncrypted: string;
  credentialsIv: string;
  credentialsTag: string;
};

@Injectable()
export class ExternalCredentialEncryptionService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env
  ) {}

  getMissingEnv(): string[] {
    return this.env.EXTERNAL_CONNECTOR_ENCRYPTION_KEY
      ? []
      : ["EXTERNAL_CONNECTOR_ENCRYPTION_KEY"];
  }

  encrypt(
    credentials: ExternalMysqlCredentialsInputDto
  ): EncryptedExternalCredentials {
    const parsed = externalMysqlCredentialsInputSchema.parse(credentials);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(parsed), "utf8"),
      cipher.final()
    ]);

    return {
      credentialsEncrypted: encrypted.toString("base64"),
      credentialsIv: iv.toString("base64"),
      credentialsTag: cipher.getAuthTag().toString("base64")
    };
  }

  decrypt(input: EncryptedExternalCredentials): ExternalMysqlCredentialsInputDto {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.getKey(),
      Buffer.from(input.credentialsIv, "base64")
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(input.credentialsTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.credentialsEncrypted, "base64")),
      decipher.final()
    ]).toString("utf8");

    return externalMysqlCredentialsInputSchema.parse(JSON.parse(plaintext));
  }

  private getKey(): Buffer {
    const value = this.env.EXTERNAL_CONNECTOR_ENCRYPTION_KEY;

    if (!value) {
      throw new Error("Missing EXTERNAL_CONNECTOR_ENCRYPTION_KEY");
    }

    return createHash("sha256").update(value).digest();
  }
}
