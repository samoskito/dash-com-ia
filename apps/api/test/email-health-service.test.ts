import { describe, expect, it } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailHealthService } from "../src/email/email-health.service";

describe("EmailHealthService", () => {
  it("checks disabled configuration without sending an email", () => {
    const health = new EmailHealthService(
      new EmailConfigurationService({
        NODE_ENV: "test",
        WEB_ORIGIN: "http://localhost:3000",
        EMAIL_PROVIDER: "",
      }),
    );

    expect(health.getConfigurationHealth()).toEqual({
      status: "disabled",
      provider: null,
    });
  });

  it("reports the Brevo relay shape without exposing credentials", () => {
    const health = new EmailHealthService(
      new EmailConfigurationService({
        NODE_ENV: "test",
        WEB_ORIGIN: "http://localhost:3000",
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp-relay.brevo.com",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_USER: "smtp-user-private",
        SMTP_PASSWORD: "smtp-password-private",
        EMAIL_FROM_NAME: "WppTrack",
        EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
        EMAIL_REPLY_TO: "suporte@rastrack.app",
      }),
    );
    const result = health.getConfigurationHealth();
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      status: "ok",
      provider: "smtp",
      relay: {
        host: "smtp-relay.brevo.com",
        port: 587,
        security: "starttls",
      },
      sender: "noreply@rastrack.app",
      replyTo: "suporte@rastrack.app",
    });
    expect(serialized).not.toContain("smtp-user-private");
    expect(serialized).not.toContain("smtp-password-private");
  });
});
