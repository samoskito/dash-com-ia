import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { RUNTIME_ENV } from "../src/common/runtime/runtime.module";
import { EmailQueueService } from "../src/email/email-queue.service";
import { LicenseNotificationService } from "../src/licensing/license-notification.service";
import { LicenseWhatsappNotifier } from "../src/licensing/license-whatsapp.notifier";
import { LicensingModule } from "../src/licensing/licensing.module";

/**
 * Regression coverage for the prod incident: POST .../resend returned
 * `{ email: "skipped", whatsapp: "skipped" }` even with SMTP env vars and a
 * phone number present.
 *
 * Root cause: license-notification.service.ts imported EmailQueueService
 * with `import type`, which erases the class at runtime. Nest's implicit
 * (design:paramtypes) constructor-injection reflection then had nothing to
 * resolve for that parameter, and `@Optional()` silently injected
 * `undefined` — sendEmail's `!this.emailQueue` guard tripped on every call,
 * even with SMTP fully configured.
 *
 * Unit tests that hand-construct LicenseNotificationService with a mocked
 * EmailQueueService (license-notification.service.test.ts) bypass Nest's DI
 * container entirely and cannot catch this class of bug — the mock is
 * always defined regardless of what the real constructor metadata says.
 * This test instead compiles the real LicensingModule through Nest's
 * TestingModule and asserts the constructor actually received the real,
 * DI-resolved EmailQueueService/LicenseWhatsappNotifier instances.
 */
function smtpAndUazapiEnv(): Record<string, string> {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password",
    EMAIL_FROM_NAME: "WppTrack",
    EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
    EMAIL_REPLY_TO: "suporte@rastrack.app",
    LICENSE_NOTIFY_UAZAPI_BASE_URL: "https://uazapi.example.com",
    LICENSE_NOTIFY_UAZAPI_TOKEN: "uazapi-token",
  };
}

// LicenseNotificationService's emailQueue/whatsapp fields are `private
// readonly`; this shape lets the test read them back without `any` while
// still bypassing TS's nominal privacy check (safe: it's a test-only cast).
type InjectedDeps = {
  emailQueue?: EmailQueueService;
  whatsapp?: LicenseWhatsappNotifier;
};

describe("LicenseNotificationService DI wiring (module compile)", () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("resolves a real EmailQueueService instance via Nest DI, not undefined", async () => {
    moduleRef = await Test.createTestingModule({ imports: [LicensingModule] })
      .overrideProvider(RUNTIME_ENV)
      .useValue(smtpAndUazapiEnv())
      .compile();

    const notify = moduleRef.get(LicenseNotificationService);
    const emailQueue = moduleRef.get(EmailQueueService);

    expect(emailQueue).toBeInstanceOf(EmailQueueService);
    expect((notify as unknown as InjectedDeps).emailQueue).toBe(emailQueue);
  });

  it("resolves a real LicenseWhatsappNotifier instance via Nest DI, not undefined", async () => {
    moduleRef = await Test.createTestingModule({ imports: [LicensingModule] })
      .overrideProvider(RUNTIME_ENV)
      .useValue(smtpAndUazapiEnv())
      .compile();

    const notify = moduleRef.get(LicenseNotificationService);
    const whatsapp = moduleRef.get(LicenseWhatsappNotifier);

    expect(whatsapp).toBeInstanceOf(LicenseWhatsappNotifier);
    expect((notify as unknown as InjectedDeps).whatsapp).toBe(whatsapp);
    expect(whatsapp.isConfigured()).toBe(true);
  });
});
