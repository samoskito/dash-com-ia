import { describe, expect, it } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailEnvelopeCryptoService } from "../src/email/email-envelope-crypto.service";
import type { EmailEnvelopeContext } from "../src/email/email.types";

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

const RAW_KEY = "PALMUP-ABCD-EFGH-IJKL-MNOP";

function context(): EmailEnvelopeContext {
  return {
    deliveryId: "delivery-license-1",
    workspaceId: null,
    template: "license_key_delivery",
    recipientHash: "recipient-hash",
    actionType: "License",
    actionId: "lic_1",
    actionVersion: "issue:2026-08-19T00:00:00.000Z",
  };
}

describe("EmailEnvelopeCryptoService license_key_delivery", () => {
  it("round-trips a license key delivery envelope without leaking the key in ciphertext framing", () => {
    const configuration = new EmailConfigurationService(smtpEnvironment());
    const crypto = new EmailEnvelopeCryptoService(configuration);
    const envelope = {
      to: { address: "aluno@example.com", name: "Aluno" },
      template: "license_key_delivery" as const,
      data: {
        recipientName: "Aluno",
        licenseKey: RAW_KEY,
        keyPrefix: "PALMUP-ABCD",
        expiresAt: "2027-08-19T00:00:00.000Z",
        productName: "RastrackDash",
        repoUrl: "https://github.com/samoskito/nod-rastrackdash-wpp",
        supportEmail: "suporte@palmup.com.br",
      },
    };
    const ctx = context();
    const encrypted = crypto.encrypt(envelope, ctx);

    expect(JSON.stringify(encrypted)).not.toContain(RAW_KEY);
    expect(crypto.decrypt(encrypted, ctx)).toEqual(envelope);
  });

  it("rejects a license key that is too short", () => {
    const configuration = new EmailConfigurationService(smtpEnvironment());
    const crypto = new EmailEnvelopeCryptoService(configuration);
    const envelope = {
      to: { address: "aluno@example.com" },
      template: "license_key_delivery" as const,
      data: {
        licenseKey: "short",
        keyPrefix: "PALMUP-ABCD",
        expiresAt: "2027-08-19T00:00:00.000Z",
        productName: "RastrackDash",
        repoUrl: "https://github.com/samoskito/nod-rastrackdash-wpp",
      },
    };

    expect(() => crypto.encrypt(envelope, context())).toThrow();
  });

  it("rejects a control character in the license key", () => {
    const configuration = new EmailConfigurationService(smtpEnvironment());
    const crypto = new EmailEnvelopeCryptoService(configuration);
    const envelope = {
      to: { address: "aluno@example.com" },
      template: "license_key_delivery" as const,
      data: {
        licenseKey: "PALMUP-ABCD-EFGH\nIJKL-MNOP",
        keyPrefix: "PALMUP-ABCD",
        expiresAt: "2027-08-19T00:00:00.000Z",
        productName: "RastrackDash",
        repoUrl: "https://github.com/samoskito/nod-rastrackdash-wpp",
      },
    };

    expect(() => crypto.encrypt(envelope, context())).toThrow();
  });
});
