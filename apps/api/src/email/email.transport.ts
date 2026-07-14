import nodemailer, { type Transporter } from "nodemailer";
import { EmailConfigurationService } from "./email-configuration.service";
import { EmailTransportFailure } from "./email-delivery-error";
import type { RenderedEmailMessage } from "./email.types";

export const EMAIL_TRANSPORT = Symbol("EMAIL_TRANSPORT");

export type EmailTransportResult = {
  messageId: string | null;
  acceptedCount: number;
  rejectedCount: number;
};

export interface EmailTransport {
  send(message: RenderedEmailMessage): Promise<EmailTransportResult>;
}

export class NodemailerEmailTransport implements EmailTransport {
  private readonly transporter: Transporter;

  constructor(configuration: EmailConfigurationService) {
    const smtp = configuration.getSmtpConfig();

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
      tls: {
        minVersion: "TLSv1.2",
        servername: smtp.host,
      },
    });
  }

  async send(message: RenderedEmailMessage): Promise<EmailTransportResult> {
    const result = await this.transporter.sendMail({
      from: message.from,
      replyTo: message.replyTo,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const acceptedCount = Array.isArray(result.accepted)
      ? result.accepted.length
      : 0;
    const rejectedCount = Array.isArray(result.rejected)
      ? result.rejected.length
      : 0;

    if (acceptedCount === 0 || rejectedCount > 0) {
      throw new EmailTransportFailure({
        kind: "permanent",
        code: "ERECIPIENT",
      });
    }

    return {
      messageId:
        typeof result.messageId === "string" && result.messageId.trim()
          ? result.messageId
          : null,
      acceptedCount,
      rejectedCount,
    };
  }
}

export class DisabledEmailTransport implements EmailTransport {
  async send(): Promise<EmailTransportResult> {
    throw new EmailTransportFailure({
      kind: "permanent",
      code: "EPROVIDERDISABLED",
    });
  }
}

export class InMemoryEmailTransport implements EmailTransport {
  readonly messages: RenderedEmailMessage[] = [];

  async send(message: RenderedEmailMessage): Promise<EmailTransportResult> {
    this.messages.push(structuredClone(message));

    return {
      messageId: `memory-${this.messages.length}`,
      acceptedCount: 1,
      rejectedCount: 0,
    };
  }
}

export function createEmailTransport(
  configuration: EmailConfigurationService,
): EmailTransport {
  return configuration.isEnabled()
    ? new NodemailerEmailTransport(configuration)
    : new DisabledEmailTransport();
}
