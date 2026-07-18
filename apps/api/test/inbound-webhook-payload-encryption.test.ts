import { describe, expect, it } from "vitest";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";

type TestEnvironment = Record<string, string | undefined>;

const firstKey = Buffer.alloc(32, 17).toString("base64");
const secondKey = Buffer.alloc(32, 29).toString("base64");
const firstContext = {
  workspaceId: "workspace_1",
  connectionId: "connection_1",
  deliveryId: "delivery_1",
};

function runtimeEnv(encryptionKey: string = firstKey): TestEnvironment {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: encryptionKey,
  };
}

function captureError(operation: () => unknown): Error {
  let thrown: unknown;

  try {
    operation();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  return thrown as Error;
}

function tamperBase64(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 1;
  return bytes.toString("base64");
}

describe("inbound webhook payload encryption", () => {
  it("round-trips the exact raw payload bytes into persistence columns", () => {
    const service = new InboundWebhookPayloadEncryptionService(runtimeEnv());
    const payload = Buffer.from(
      '{"EventId":"event-1","message":"private-payload-marker"}',
      "utf8",
    );

    const encrypted = service.encrypt(payload, firstContext);

    expect(Object.keys(encrypted).sort()).toEqual(
      [
        "encryptedPayload",
        "payloadIv",
        "payloadTag",
        "encryptionKeyVersion",
      ].sort(),
    );
    expect(encrypted.encryptedPayload).not.toContain("private-payload-marker");
    expect(Buffer.from(encrypted.payloadIv, "base64")).toHaveLength(12);
    expect(Buffer.from(encrypted.payloadTag, "base64")).toHaveLength(16);
    expect(encrypted.encryptionKeyVersion).toBe(1);
    expect(service.decrypt(encrypted, firstContext).equals(payload)).toBe(true);
  });

  it("uses a random IV for identical payload bytes", () => {
    const service = new InboundWebhookPayloadEncryptionService(runtimeEnv());
    const payload = Buffer.from('{"EventId":"same-event"}', "utf8");

    const first = service.encrypt(payload, firstContext);
    const second = service.encrypt(payload, firstContext);

    expect(first.payloadIv).not.toBe(second.payloadIv);
    expect(first.encryptedPayload).not.toBe(second.encryptedPayload);
    expect(service.decrypt(first, firstContext).equals(payload)).toBe(true);
    expect(service.decrypt(second, firstContext).equals(payload)).toBe(true);
  });

  it("rejects tampering without exposing payload, key, or ciphertext", () => {
    const service = new InboundWebhookPayloadEncryptionService(runtimeEnv());
    const privateMarker = "private-message-that-must-not-leak";
    const encrypted = service.encrypt(
      Buffer.from(privateMarker, "utf8"),
      firstContext,
    );
    const tampered = {
      ...encrypted,
      encryptedPayload: tamperBase64(encrypted.encryptedPayload),
    };

    const error = captureError(() => service.decrypt(tampered, firstContext));

    expect(error.message).toBe("Inbound webhook payload decryption failed");
    expect(error.message).not.toContain(privateMarker);
    expect(error.message).not.toContain(firstKey);
    expect(error.message).not.toContain(encrypted.encryptedPayload);
    expect(error.message).not.toContain(tampered.encryptedPayload);
  });

  it("rejects a valid but wrong key without exposing either key or ciphertext", () => {
    const encryptor = new InboundWebhookPayloadEncryptionService(runtimeEnv());
    const decryptor = new InboundWebhookPayloadEncryptionService(
      runtimeEnv(secondKey),
    );
    const encrypted = encryptor.encrypt(
      Buffer.from("another-private-payload", "utf8"),
      firstContext,
    );

    const error = captureError(() =>
      decryptor.decrypt(encrypted, firstContext),
    );

    expect(error.message).toBe("Inbound webhook payload decryption failed");
    expect(error.message).not.toContain(firstKey);
    expect(error.message).not.toContain(secondKey);
    expect(error.message).not.toContain(encrypted.encryptedPayload);
  });

  it("uses validated runtime configuration without leaking a rejected key", () => {
    const rejectedKey = "invalid-private-encryption-key";
    const service = new InboundWebhookPayloadEncryptionService(
      runtimeEnv(rejectedKey),
    );

    const error = captureError(() =>
      service.encrypt(Buffer.from("payload", "utf8"), firstContext),
    );

    expect(error.message).toBe("Inbound webhook payload encryption failed");
    expect(error.message).not.toContain(rejectedKey);
  });

  it("rejects ciphertext transplanted to another tenant or delivery", () => {
    const service = new InboundWebhookPayloadEncryptionService(runtimeEnv());
    const encrypted = service.encrypt(
      Buffer.from('{"EventId":"tenant-bound"}', "utf8"),
      firstContext,
    );

    for (const context of [
      { ...firstContext, workspaceId: "workspace_2" },
      { ...firstContext, connectionId: "connection_2" },
      { ...firstContext, deliveryId: "delivery_2" },
    ]) {
      const error = captureError(() => service.decrypt(encrypted, context));

      expect(error.message).toBe("Inbound webhook payload decryption failed");
      expect(error.message).not.toContain(context.workspaceId);
      expect(error.message).not.toContain(encrypted.encryptedPayload);
    }
  });
});
