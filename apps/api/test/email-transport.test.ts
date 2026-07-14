import nodemailer from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { NodemailerEmailTransport } from "../src/email/email.transport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NodemailerEmailTransport", () => {
  it("configures Brevo port 587 with mandatory STARTTLS", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "provider-id",
      accepted: ["cliente@example.com"],
      rejected: [],
    }));
    const createTransport = vi
      .spyOn(nodemailer, "createTransport")
      .mockReturnValue({ sendMail } as never);
    const transport = new NodemailerEmailTransport(
      new EmailConfigurationService({
        NODE_ENV: "test",
        WEB_ORIGIN: "http://localhost:3000",
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp-relay.brevo.com",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_USER: "smtp-user-private",
        SMTP_PASSWORD: "smtp-key-private",
        EMAIL_FROM_NAME: "WppTrack",
        EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
        EMAIL_REPLY_TO: "suporte@rastrack.app",
      }),
    );

    await expect(
      transport.send({
        from: { name: "WppTrack", address: "noreply@rastrack.app" },
        replyTo: "suporte@rastrack.app",
        to: { address: "cliente@example.com" },
        subject: "Mensagem de teste",
        text: "Conteúdo em texto",
        html: "<p>Conteúdo HTML</p>",
      }),
    ).resolves.toEqual({
      messageId: "provider-id",
      acceptedCount: 1,
      rejectedCount: 0,
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: "smtp-user-private",
        pass: "smtp-key-private",
      },
      tls: {
        minVersion: "TLSv1.2",
        servername: "smtp-relay.brevo.com",
      },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "WppTrack", address: "noreply@rastrack.app" },
        replyTo: "suporte@rastrack.app",
      }),
    );
  });
});
