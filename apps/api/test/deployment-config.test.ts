import { describe, expect, it } from "vitest";
import {
  DeploymentConfigError,
  parseDeploymentConfig,
} from "../src/config/deployment-config";

type TestEnvironment = Record<string, string | undefined>;
const inboundWebhookEncryptionKey = Buffer.alloc(32, 7).toString("base64");

function testEnv(overrides: TestEnvironment = {}): TestEnvironment {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    ...overrides,
  };
}

function smtpEnv(overrides: TestEnvironment = {}): TestEnvironment {
  return testEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp-relay.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-secret-value",
    EMAIL_FROM_NAME: "WppTrack",
    EMAIL_FROM_ADDRESS: "noreply@example.com",
    EMAIL_REPLY_TO: "support@example.com",
    ...overrides,
  });
}

describe("parseDeploymentConfig", () => {
  it("uses safe defaults for disabled capabilities", () => {
    expect(parseDeploymentConfig(testEnv())).toEqual({
      authGoogleEnabled: false,
      metaConnectionModes: ["oauth"],
      email: { provider: "", smtp: null },
      inboundWebhooks: {
        enabled: false,
        replayEnabled: false,
        productionEnabled: false,
        conversionRulesEnabled: false,
        conversionProductionEnabled: false,
        apiPublicUrl: null,
        encryptionKey: null,
        rawPayloadRetentionDays: 7,
      },
      webOrigin: "http://localhost:3000",
    });
  });

  it("parses enabled flags, Meta modes, and SMTP configuration", () => {
    expect(
      parseDeploymentConfig(
        smtpEnv({
          NODE_ENV: "production",
          WEB_ORIGIN: "https://app.example.com/",
          AUTH_GOOGLE_ENABLED: "TRUE",
          META_CONNECTION_MODES: "oauth, manual",
          API_PUBLIC_URL: "https://api.example.com/",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_REPLAY_ENABLED: "true",
          INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
          INBOUND_CONVERSION_RULES_ENABLED: "true",
          INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
          SMTP_HOST: "smtp-relay.brevo.com",
          SMTP_SECURE: "false",
          EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
          EMAIL_REPLY_TO: "suporte@rastrack.app",
        }),
      ),
    ).toEqual({
      authGoogleEnabled: true,
      metaConnectionModes: ["oauth", "manual"],
      email: {
        provider: "smtp",
        smtp: {
          host: "smtp-relay.brevo.com",
          port: 587,
          secure: false,
          user: "smtp-user",
          password: "smtp-secret-value",
          fromName: "WppTrack",
          fromAddress: "noreply@rastrack.app",
          replyTo: "suporte@rastrack.app",
        },
      },
      inboundWebhooks: {
        enabled: true,
        replayEnabled: true,
        productionEnabled: true,
        conversionRulesEnabled: true,
        conversionProductionEnabled: true,
        apiPublicUrl: "https://api.example.com",
        encryptionKey: Buffer.from(inboundWebhookEncryptionKey, "base64"),
        rawPayloadRetentionDays: 7,
      },
      webOrigin: "https://app.example.com",
    });
  });

  it("does not validate dormant inbound webhook values when disabled", () => {
    expect(
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "not-a-url",
          INBOUND_WEBHOOKS_ENABLED: "false",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: "short",
        }),
      ).inboundWebhooks,
    ).toEqual({
      enabled: false,
      replayEnabled: false,
      productionEnabled: false,
      conversionRulesEnabled: false,
      conversionProductionEnabled: false,
      apiPublicUrl: null,
      encryptionKey: null,
      rawPayloadRetentionDays: 7,
    });
  });

  it("keeps controlled inbound replay disabled by default", () => {
    expect(
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ).inboundWebhooks.replayEnabled,
    ).toBe(false);
  });

  it("keeps provider conversion processing disabled by default", () => {
    expect(
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ).inboundWebhooks,
    ).toMatchObject({
      conversionRulesEnabled: false,
      conversionProductionEnabled: false,
    });
  });

  it("requires conversion observation before production", () => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
          INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
        }),
      ),
    ).toThrowError(
      "Invalid INBOUND_CONVERSION_PRODUCTION_ENABLED: requires INBOUND_CONVERSION_RULES_ENABLED=true",
    );
  });

  it.each([
    "INBOUND_CONVERSION_RULES_ENABLED",
    "INBOUND_CONVERSION_PRODUCTION_ENABLED",
  ])("validates provider conversion flag %s", (field) => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
          [field]: "sometimes",
        }),
      ),
    ).toThrowError(`Invalid ${field}: expected true or false`);
  });

  it("validates the controlled inbound replay flag", () => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_REPLAY_ENABLED: "sometimes",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ),
    ).toThrowError(
      "Invalid INBOUND_WEBHOOK_REPLAY_ENABLED: expected true or false",
    );
  });

  it("requires API_PUBLIC_URL when inbound webhooks are enabled", () => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ),
    ).toThrowError(
      "Invalid API_PUBLIC_URL: required when INBOUND_WEBHOOKS_ENABLED=true",
    );
  });

  it("requires an encryption key when inbound webhooks are enabled", () => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
        }),
      ),
    ).toThrowError(
      "Invalid INBOUND_WEBHOOK_ENCRYPTION_KEY: required when INBOUND_WEBHOOKS_ENABLED=true",
    );
  });

  it.each([
    "short",
    Buffer.alloc(31, 7).toString("base64"),
    Buffer.alloc(33, 7).toString("base64"),
    "***************************************=",
  ])("rejects malformed inbound webhook encryption key", (key) => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: key,
        }),
      ),
    ).toThrowError(
      "Invalid INBOUND_WEBHOOK_ENCRYPTION_KEY: expected a Base64-encoded 32-byte key",
    );
  });

  it("does not include the inbound webhook key in validation errors", () => {
    const key = "inbound-key-that-must-stay-private";

    try {
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: key,
        }),
      );
      throw new Error("Expected configuration parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DeploymentConfigError);
      expect((error as Error).message).not.toContain(key);
    }
  });

  it.each(["development", "test"])(
    "allows HTTP localhost API_PUBLIC_URL in %s",
    (nodeEnv) => {
      expect(
        parseDeploymentConfig(
          testEnv({
            NODE_ENV: nodeEnv,
            API_PUBLIC_URL: "http://127.0.0.1:3333",
            INBOUND_WEBHOOKS_ENABLED: "true",
            INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
          }),
        ).inboundWebhooks.apiPublicUrl,
      ).toBe("http://127.0.0.1:3333");
    },
  );

  it.each([
    ["production", "http://localhost:3333"],
    ["staging", "http://localhost:3333"],
    ["development", "http://api.example.com"],
  ])("rejects insecure API_PUBLIC_URL in %s", (nodeEnv, apiPublicUrl) => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          NODE_ENV: nodeEnv,
          API_PUBLIC_URL: apiPublicUrl,
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ),
    ).toThrowError(
      "Invalid API_PUBLIC_URL: expected HTTPS, except HTTP localhost in development or test",
    );
  });

  it.each([
    "/webhooks",
    "api.example.com",
    "ftp://api.example.com",
    "https://api.example.com/webhooks",
    "https://user:secret@api.example.com",
  ])("rejects invalid API_PUBLIC_URL %s", (apiPublicUrl) => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({
          API_PUBLIC_URL: apiPublicUrl,
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: inboundWebhookEncryptionKey,
        }),
      ),
    ).toThrowError(/Invalid API_PUBLIC_URL/);
  });

  it("rejects unknown Meta connection modes", () => {
    expect(() =>
      parseDeploymentConfig(testEnv({ META_CONNECTION_MODES: "oauth,legacy" })),
    ).toThrowError(
      "Invalid META_CONNECTION_MODES: expected a comma-separated list containing only oauth and manual",
    );
  });

  it("rejects unsupported email providers", () => {
    expect(() =>
      parseDeploymentConfig(testEnv({ EMAIL_PROVIDER: "api" })),
    ).toThrowError("Invalid EMAIL_PROVIDER: expected empty or smtp");
  });

  it("does not validate dormant SMTP values when email is disabled", () => {
    expect(
      parseDeploymentConfig(
        testEnv({
          EMAIL_PROVIDER: "",
          SMTP_PORT: "not-a-port",
          SMTP_SECURE: "sometimes",
          EMAIL_FROM_ADDRESS: "not-an-email",
        }),
      ).email,
    ).toEqual({ provider: "", smtp: null });
  });

  it.each([
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM_NAME",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_REPLY_TO",
  ])("requires %s when SMTP is enabled", (field) => {
    const env = smtpEnv();
    delete env[field];

    expect(() => parseDeploymentConfig(env)).toThrowError(
      `Invalid ${field}: required when EMAIL_PROVIDER=smtp`,
    );
  });

  it.each([
    ["SMTP_HOST", "smtp.example.com"],
    ["SMTP_PORT", "465"],
    ["SMTP_SECURE", "true"],
    ["EMAIL_FROM_ADDRESS", "other@rastrack.app"],
    ["EMAIL_REPLY_TO", "other@rastrack.app"],
  ])("rejects unsafe production Brevo setting %s", (field, value) => {
    expect(() =>
      parseDeploymentConfig(
        smtpEnv({
          NODE_ENV: "production",
          WEB_ORIGIN: "https://app.rastrack.app",
          SMTP_HOST: "smtp-relay.brevo.com",
          EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
          EMAIL_REPLY_TO: "suporte@rastrack.app",
          [field]: value,
        }),
      ),
    ).toThrowError(new RegExp(`Invalid ${field}`));
  });

  it.each(["0", "65536", "58.7", "not-a-port"])(
    "rejects invalid SMTP port %s",
    (port) => {
      expect(() =>
        parseDeploymentConfig(smtpEnv({ SMTP_PORT: port })),
      ).toThrowError(
        "Invalid SMTP_PORT: expected an integer between 1 and 65535",
      );
    },
  );

  it("rejects invalid boolean values", () => {
    expect(() =>
      parseDeploymentConfig(testEnv({ AUTH_GOOGLE_ENABLED: "yes" })),
    ).toThrowError("Invalid AUTH_GOOGLE_ENABLED: expected true or false");

    expect(() =>
      parseDeploymentConfig(smtpEnv({ SMTP_SECURE: "yes" })),
    ).toThrowError("Invalid SMTP_SECURE: expected true or false");

    expect(() =>
      parseDeploymentConfig(testEnv({ INBOUND_WEBHOOKS_ENABLED: "sometimes" })),
    ).toThrowError("Invalid INBOUND_WEBHOOKS_ENABLED: expected true or false");
  });

  it.each(["EMAIL_FROM_ADDRESS", "EMAIL_REPLY_TO"])(
    "validates %s as an email address when SMTP is enabled",
    (field) => {
      expect(() =>
        parseDeploymentConfig(smtpEnv({ [field]: "not-an-email" })),
      ).toThrowError(`Invalid ${field}: expected a valid email address`);
    },
  );

  it("does not include SMTP secrets in validation errors", () => {
    const password = "smtp-password-that-must-stay-private";

    try {
      parseDeploymentConfig(
        smtpEnv({ SMTP_PASSWORD: password, SMTP_PORT: "invalid" }),
      );
      throw new Error("Expected configuration parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DeploymentConfigError);
      expect((error as Error).message).not.toContain(password);
    }
  });

  it.each(["development", "test"])("allows HTTP localhost in %s", (nodeEnv) => {
    expect(
      parseDeploymentConfig(
        testEnv({
          NODE_ENV: nodeEnv,
          WEB_ORIGIN: "http://127.0.0.1:3000",
        }),
      ).webOrigin,
    ).toBe("http://127.0.0.1:3000");
  });

  it.each([
    ["production", "http://localhost:3000"],
    ["staging", "http://localhost:3000"],
    ["development", "http://app.example.com"],
  ])("rejects insecure WEB_ORIGIN in %s", (nodeEnv, webOrigin) => {
    expect(() =>
      parseDeploymentConfig(
        testEnv({ NODE_ENV: nodeEnv, WEB_ORIGIN: webOrigin }),
      ),
    ).toThrowError(
      "Invalid WEB_ORIGIN: expected HTTPS, except HTTP localhost in development or test",
    );
  });

  it.each(["/login", "app.example.com", "ftp://app.example.com"])(
    "rejects non-absolute HTTP(S) WEB_ORIGIN %s",
    (webOrigin) => {
      expect(() =>
        parseDeploymentConfig(testEnv({ WEB_ORIGIN: webOrigin })),
      ).toThrowError(/Invalid WEB_ORIGIN/);
    },
  );
});
