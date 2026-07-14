import { describe, expect, it } from "vitest";
import {
  DeploymentConfigError,
  parseDeploymentConfig,
} from "../src/config/deployment-config";

type TestEnvironment = Record<string, string | undefined>;

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
      webOrigin: "https://app.example.com",
    });
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
