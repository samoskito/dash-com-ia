import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";

const ALGORITHM = "aes-256-gcm";
const CURRENT_KEY_VERSION = 1 as const;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const ASSOCIATED_DATA_PREFIX = "wpptrack:inbound-webhook-payload:v1";
const ENCRYPTION_ERROR = "Inbound webhook payload encryption failed";
const DECRYPTION_ERROR = "Inbound webhook payload decryption failed";

export type EncryptedInboundWebhookPayload = {
  encryptedPayload: string;
  payloadIv: string;
  payloadTag: string;
  encryptionKeyVersion: number;
};

export type InboundWebhookPayloadEncryptionContext = {
  workspaceId: string;
  connectionId: string;
  deliveryId: string;
};

@Injectable()
export class InboundWebhookPayloadEncryptionService {
  readonly currentKeyVersion = CURRENT_KEY_VERSION;

  constructor(
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  encrypt(
    payload: Buffer,
    context: Readonly<InboundWebhookPayloadEncryptionContext>,
  ): EncryptedInboundWebhookPayload {
    try {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv(ALGORITHM, this.key(), iv);
      cipher.setAAD(this.associatedData(context));
      const encryptedPayload = Buffer.concat([
        cipher.update(payload),
        cipher.final(),
      ]);

      return {
        encryptedPayload: encryptedPayload.toString("base64"),
        payloadIv: iv.toString("base64"),
        payloadTag: cipher.getAuthTag().toString("base64"),
        encryptionKeyVersion: this.currentKeyVersion,
      };
    } catch {
      throw new Error(ENCRYPTION_ERROR);
    }
  }

  decrypt(
    payload: Readonly<EncryptedInboundWebhookPayload>,
    context: Readonly<InboundWebhookPayloadEncryptionContext>,
  ): Buffer {
    try {
      if (payload.encryptionKeyVersion !== this.currentKeyVersion) {
        throw new Error(DECRYPTION_ERROR);
      }

      const iv = this.decodeBase64(payload.payloadIv, IV_LENGTH_BYTES);
      const tag = this.decodeBase64(payload.payloadTag, AUTH_TAG_LENGTH_BYTES);
      const encryptedPayload = this.decodeBase64(payload.encryptedPayload);
      const decipher = createDecipheriv(ALGORITHM, this.key(), iv);
      decipher.setAAD(this.associatedData(context));
      decipher.setAuthTag(tag);

      return Buffer.concat([
        decipher.update(encryptedPayload),
        decipher.final(),
      ]);
    } catch {
      throw new Error(DECRYPTION_ERROR);
    }
  }

  private key(): Buffer {
    const config = parseInboundWebhooksConfig(this.env);

    if (!config.enabled) {
      throw new Error(ENCRYPTION_ERROR);
    }

    return config.encryptionKey;
  }

  private associatedData(
    context: Readonly<InboundWebhookPayloadEncryptionContext>,
  ): Buffer {
    const values = [
      context.workspaceId,
      context.connectionId,
      context.deliveryId,
    ];

    if (
      values.some(
        (value) =>
          typeof value !== "string" ||
          value.length === 0 ||
          value.length > 255 ||
          value.includes("\0"),
      )
    ) {
      throw new Error(ENCRYPTION_ERROR);
    }

    return Buffer.from(
      [ASSOCIATED_DATA_PREFIX, String(this.currentKeyVersion), ...values].join(
        "\0",
      ),
      "utf8",
    );
  }

  private decodeBase64(value: string, expectedLength?: number): Buffer {
    const decoded = Buffer.from(value, "base64");

    if (
      decoded.toString("base64") !== value ||
      (expectedLength !== undefined && decoded.length !== expectedLength)
    ) {
      throw new Error(DECRYPTION_ERROR);
    }

    return decoded;
  }
}
