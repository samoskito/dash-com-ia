import { Injectable } from "@nestjs/common";
import { EmailConfigurationService } from "./email-configuration.service";
import type {
  RenderedEmailMessage,
  TransactionalEmailEnvelope,
} from "./email.types";

type EmailBody = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footerNote: string;
};

@Injectable()
export class EmailMessageRenderer {
  constructor(private readonly configuration: EmailConfigurationService) {}

  render(envelope: TransactionalEmailEnvelope): RenderedEmailMessage {
    const smtp = this.configuration.getSmtpConfig();
    const rendered = this.renderTemplate(envelope);

    return {
      from: {
        name: smtp.fromName,
        address: smtp.fromAddress,
      },
      replyTo: smtp.replyTo,
      to: envelope.to,
      subject: rendered.subject,
      text: this.renderText(rendered.body),
      html: this.renderHtml(rendered.body),
    };
  }

  private renderTemplate(envelope: TransactionalEmailEnvelope): {
    subject: string;
    body: EmailBody;
  } {
    if (envelope.template === "workspace_invitation") {
      const workspaceName = envelope.data.workspaceName;
      const inviter = envelope.data.inviterName
        ? `${envelope.data.inviterName} convidou você`
        : "Você recebeu um convite";

      return {
        subject: `Convite para acessar ${workspaceName} no WppTrack`,
        body: {
          preheader: `Seu acesso ao workspace ${workspaceName} está pronto para ser ativado.`,
          heading: `Você foi convidado para ${workspaceName}`,
          paragraphs: [
            `${inviter} para participar deste workspace no WppTrack com o perfil ${envelope.data.roleLabel}.`,
            `Este convite expira em ${this.formatExpiry(envelope.data.expiresAt)}.`,
          ],
          actionLabel: "Aceitar convite",
          actionUrl: this.actionUrl(
            "/settings/invites/accept",
            envelope.data.token,
          ),
          footerNote:
            "Se você não esperava este convite, ignore esta mensagem ou fale com nosso suporte.",
        },
      };
    }

    if (envelope.template === "password_reset") {
      return {
        subject: "Redefina sua senha no WppTrack",
        body: {
          preheader: "Use este link protegido para criar uma nova senha.",
          heading: this.personalizedHeading(
            envelope.data.recipientName,
            "Vamos redefinir sua senha",
          ),
          paragraphs: [
            "Recebemos uma solicitação para redefinir a senha da sua conta.",
            `O link expira em ${this.formatExpiry(envelope.data.expiresAt)} e só pode ser usado uma vez.`,
          ],
          actionLabel: "Criar nova senha",
          actionUrl: this.actionUrl("/login/reset", envelope.data.token),
          footerNote:
            "Se você não solicitou a alteração, ignore esta mensagem. Sua senha continuará a mesma.",
        },
      };
    }

    return {
      subject: "Confirme seu e-mail no WppTrack",
      body: {
        preheader: "Confirme seu endereço de e-mail para proteger sua conta.",
        heading: this.personalizedHeading(
          envelope.data.recipientName,
          "Confirme seu e-mail",
        ),
        paragraphs: [
          "Só falta confirmar que este endereço de e-mail pertence a você.",
          `O link expira em ${this.formatExpiry(envelope.data.expiresAt)} e só pode ser usado uma vez.`,
        ],
        actionLabel: "Confirmar e-mail",
        actionUrl: this.actionUrl("/login/verify", envelope.data.token),
        footerNote:
          "Se você não reconhece esta conta, ignore esta mensagem ou entre em contato com nosso suporte.",
      },
    };
  }

  private renderText(body: EmailBody): string {
    return [
      "WppTrack",
      "",
      body.heading,
      "",
      ...body.paragraphs.flatMap((paragraph) => [paragraph, ""]),
      `${body.actionLabel}: ${body.actionUrl}`,
      "",
      body.footerNote,
      "",
      "Suporte: suporte@rastrack.app",
    ].join("\n");
  }

  private renderHtml(body: EmailBody): string {
    const paragraphs = body.paragraphs
      .map(
        (paragraph) =>
          `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.65;">${this.escapeHtml(paragraph)}</p>`,
      )
      .join("");

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${this.escapeHtml(body.heading)}</title>
  <style>@media (max-width:620px){.email-shell{width:100%!important}.email-content{padding:28px 22px!important}.email-action{display:block!important;text-align:center!important}}</style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${this.escapeHtml(body.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #dbe5e3;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:22px 32px;background:#0f2926;color:#ffffff;font-size:20px;font-weight:700;">WppTrack</td></tr>
          <tr>
            <td class="email-content" style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 20px;color:#102a27;font-size:26px;line-height:1.25;letter-spacing:0;">${this.escapeHtml(body.heading)}</h1>
              ${paragraphs}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;">
                <tr><td bgcolor="#0e8c7a" style="border-radius:6px;"><a class="email-action" href="${this.escapeHtml(body.actionUrl)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">${this.escapeHtml(body.actionLabel)}</a></td></tr>
              </table>
              <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">${this.escapeHtml(body.footerNote)}</p>
            </td>
          </tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;">Precisa de ajuda? Responda este e-mail ou escreva para <a href="mailto:suporte@rastrack.app" style="color:#0e8c7a;">suporte@rastrack.app</a>.</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private personalizedHeading(
    name: string | undefined,
    fallback: string,
  ): string {
    return name ? `${name}, ${fallback.toLowerCase()}` : fallback;
  }

  private actionUrl(path: string, token: string): string {
    const url = new URL(path, `${this.configuration.getWebOrigin()}/`);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private formatExpiry(value: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => {
      const escaped: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      };

      return escaped[character] ?? character;
    });
  }
}
