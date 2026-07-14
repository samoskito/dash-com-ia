import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailEnvelopeCryptoService } from "../src/email/email-envelope-crypto.service";
import { EmailMessageRenderer } from "../src/email/email-message.renderer";
import { EmailProcessor } from "../src/email/email.processor";
import {
  EmailTransportFailure,
  classifyEmailDeliveryError,
} from "../src/email/email-delivery-error";
import { InMemoryEmailTransport } from "../src/email/email.transport";
import type { EmailDeliveryJobPayload } from "../src/email/email.types";

function configuration() {
  return new EmailConfigurationService({
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password-private",
    EMAIL_FROM_NAME: "WppTrack",
    EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
    EMAIL_REPLY_TO: "suporte@rastrack.app",
  });
}

const rawToken = "raw-action-token-that-must-remain-private-1234567890";

function jobPayload(
  crypto: EmailEnvelopeCryptoService,
): EmailDeliveryJobPayload {
  const context = {
    deliveryId: "delivery-1",
    workspaceId: null,
    template: "password_reset" as const,
    recipientHash: "recipient-hash",
    actionType: "AuthActionToken" as const,
    actionId: "action-token-1",
    actionVersion: "1",
  };
  const encrypted = crypto.encrypt(
    {
      to: { address: "cliente@example.com", name: "Cliente" },
      template: "password_reset",
      data: {
        recipientName: "Cliente",
        token: rawToken,
        expiresAt: "2026-07-14T13:00:00.000Z",
      },
    },
    context,
  );

  return {
    ...context,
    ...encrypted,
  };
}

function job(data: EmailDeliveryJobPayload, attemptsMade = 0) {
  return {
    id: "email-delivery-1",
    name: "send-transactional-email",
    data,
    attemptsMade,
    opts: { attempts: 4 },
  } as never;
}

describe("EmailProcessor", () => {
  it("decrypts, renders and sends through the in-memory transport", async () => {
    const config = configuration();
    const crypto = new EmailEnvelopeCryptoService(config);
    const transport = new InMemoryEmailTransport();
    const audit = { record: vi.fn(async () => undefined) };
    const actionStatus = { record: vi.fn(async () => undefined) };
    const processor = new EmailProcessor(
      crypto,
      new EmailMessageRenderer(config),
      transport,
      audit as never,
      actionStatus as never,
    );
    const payload = jobPayload(crypto);

    await expect(processor.process(job(payload))).resolves.toEqual({
      deliveryId: "delivery-1",
      status: "sent",
      acceptedCount: 1,
    });
    expect(transport.messages).toHaveLength(1);
    expect(transport.messages[0].text).toContain(rawToken);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        recipientHash: "recipient-hash",
        attemptNumber: 1,
        maxAttempts: 4,
      }),
    );
    expect(actionStatus.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "AuthActionToken",
        actionId: "action-token-1",
        status: "sent",
      }),
    );
    expect(JSON.stringify(payload)).not.toContain(rawToken);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(rawToken);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      "cliente@example.com",
    );
  });

  it("keeps transient failures retryable with a redacted error", async () => {
    const config = configuration();
    const crypto = new EmailEnvelopeCryptoService(config);
    const transport = {
      send: vi.fn(async () => {
        throw Object.assign(
          new Error("provider detail with cliente@example.com"),
          {
            code: "ETIMEDOUT",
          },
        );
      }),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const actionStatus = { record: vi.fn(async () => undefined) };
    const processor = new EmailProcessor(
      crypto,
      new EmailMessageRenderer(config),
      transport,
      audit as never,
      actionStatus as never,
    );

    await expect(processor.process(job(jobPayload(crypto)))).rejects.toThrow(
      "Transactional email delivery failed (ETIMEDOUT)",
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retrying",
        failureKind: "transient",
        errorCode: "ETIMEDOUT",
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      "cliente@example.com",
    );
    expect(actionStatus.record).not.toHaveBeenCalled();
  });

  it("marks permanent SMTP failures as unrecoverable", async () => {
    const config = configuration();
    const crypto = new EmailEnvelopeCryptoService(config);
    const transport = {
      send: vi.fn(async () => {
        throw Object.assign(new Error("recipient rejected"), {
          responseCode: 550,
        });
      }),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const actionStatus = { record: vi.fn(async () => undefined) };
    const processor = new EmailProcessor(
      crypto,
      new EmailMessageRenderer(config),
      transport,
      audit as never,
      actionStatus as never,
    );

    await expect(
      processor.process(job(jobPayload(crypto))),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failureKind: "permanent",
        errorCode: "SMTP_550",
      }),
    );
    expect(actionStatus.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("rejects tampered workspace metadata before sending", async () => {
    const config = configuration();
    const crypto = new EmailEnvelopeCryptoService(config);
    const transport = new InMemoryEmailTransport();
    const audit = { record: vi.fn(async () => undefined) };
    const actionStatus = { record: vi.fn(async () => undefined) };
    const processor = new EmailProcessor(
      crypto,
      new EmailMessageRenderer(config),
      transport,
      audit as never,
      actionStatus as never,
    );
    const payload = {
      ...jobPayload(crypto),
      workspaceId: "tampered-workspace",
    };

    await expect(processor.process(job(payload))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(transport.messages).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "EINVALIDPAYLOAD",
        workspaceId: null,
        template: "unknown",
        recipientHash: "unavailable",
      }),
    );
    expect(actionStatus.record).not.toHaveBeenCalled();
  });

  it("classifies expected transport failures without provider messages", () => {
    expect(
      classifyEmailDeliveryError(
        new EmailTransportFailure({ kind: "permanent", code: "EAUTH" }),
      ),
    ).toEqual({ kind: "permanent", code: "EAUTH" });
    expect(classifyEmailDeliveryError({ responseCode: 421 })).toEqual({
      kind: "transient",
      code: "SMTP_421",
    });
  });

  it("does not retry an already sent email when auditing fails", async () => {
    const config = configuration();
    const crypto = new EmailEnvelopeCryptoService(config);
    const transport = new InMemoryEmailTransport();
    const audit = {
      record: vi.fn(async () => {
        throw new Error("audit unavailable");
      }),
    };
    const actionStatus = { record: vi.fn(async () => undefined) };
    const processor = new EmailProcessor(
      crypto,
      new EmailMessageRenderer(config),
      transport,
      audit as never,
      actionStatus as never,
    );

    await expect(
      processor.process(job(jobPayload(crypto))),
    ).resolves.toMatchObject({
      status: "sent",
    });
    expect(transport.messages).toHaveLength(1);
  });
});
