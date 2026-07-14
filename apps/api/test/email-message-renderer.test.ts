import { describe, expect, it } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailEnvelopeCryptoService } from "../src/email/email-envelope-crypto.service";
import { EmailMessageRenderer } from "../src/email/email-message.renderer";
import type { TransactionalEmailEnvelope } from "../src/email/email.types";

function smtpEnvironment() {
  return {
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
  };
}

const rawToken = "raw-action-token-that-must-remain-private-1234567890";

describe("EmailMessageRenderer", () => {
  it.each<{
    envelope: TransactionalEmailEnvelope;
    path: string;
    actionLabel: string;
  }>([
    {
      envelope: {
        to: { address: "membro@example.com", name: "Membro" },
        template: "workspace_invitation",
        data: {
          workspaceName: "Empresa Exemplo",
          inviterName: "Gestora",
          roleLabel: "Analista",
          token: rawToken,
          expiresAt: "2026-07-21T12:00:00.000Z",
        },
      },
      path: "/invite/accept",
      actionLabel: "Aceitar convite",
    },
    {
      envelope: {
        to: { address: "cliente@example.com" },
        template: "password_reset",
        data: {
          recipientName: "Cliente",
          token: rawToken,
          expiresAt: "2026-07-14T13:00:00.000Z",
        },
      },
      path: "/login/reset",
      actionLabel: "Criar nova senha",
    },
    {
      envelope: {
        to: { address: "cliente@example.com" },
        template: "email_verification",
        data: {
          recipientName: "Cliente",
          token: rawToken,
          expiresAt: "2026-07-15T12:00:00.000Z",
        },
      },
      path: "/login/verify",
      actionLabel: "Confirmar e-mail",
    },
  ])(
    "renders $envelope.template with HTML and text",
    ({ envelope, path, actionLabel }) => {
      const configuration = new EmailConfigurationService(smtpEnvironment());
      const renderer = new EmailMessageRenderer(configuration);
      const message = renderer.render(envelope);
      const expectedUrl = new URL(path, "http://localhost:3000");
      expectedUrl.searchParams.set("token", rawToken);

      expect(message.from).toEqual({
        name: "WppTrack",
        address: "noreply@rastrack.app",
      });
      expect(message.replyTo).toBe("suporte@rastrack.app");
      expect(message.to).toEqual(envelope.to);
      expect(message.html).toContain(actionLabel);
      expect(message.text).toContain(actionLabel);
      expect(message.html).toContain(
        expectedUrl.toString().replaceAll("&", "&amp;"),
      );
      expect(message.text).toContain(expectedUrl.toString());
      expect(message.html).toContain('lang="pt-BR"');
    },
  );

  it("escapes user-controlled display values before rendering HTML", () => {
    const configuration = new EmailConfigurationService(smtpEnvironment());
    const crypto = new EmailEnvelopeCryptoService(configuration);
    const renderer = new EmailMessageRenderer(configuration);
    const context = {
      deliveryId: "delivery-id",
      workspaceId: "workspace-1",
      template: "workspace_invitation" as const,
      recipientHash: "recipient-hash",
      actionType: "WorkspaceInvite" as const,
      actionId: "invite-1",
      actionVersion: "2026-07-21T12:00:00.000Z",
    };
    const encrypted = crypto.encrypt(
      {
        to: { address: "membro@example.com" },
        template: "workspace_invitation",
        data: {
          workspaceName: "Empresa <script>alert(1)</script>",
          roleLabel: "Analista",
          token: rawToken,
          expiresAt: "2026-07-21T12:00:00.000Z",
        },
      },
      context,
    );
    const message = renderer.render(crypto.decrypt(encrypted, context));

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});
