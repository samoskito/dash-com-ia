import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { RUNTIME_ENV } from "../src/common/runtime/runtime.module";
import { GuruLicenseWebhookService } from "../src/licensing/guru-license-webhook.service";
import { LicenseNotificationService } from "../src/licensing/license-notification.service";
import { LicensingModule } from "../src/licensing/licensing.module";

/**
 * Regression coverage: GuruLicenseWebhookService used to declare
 * `@Optional() notifications?: LicenseNotificationService`. If that
 * dependency ever failed to resolve (bad module wiring, a standalone test
 * module missing EmailModule, a future refactor), Nest would silently inject
 * `undefined` and every purchase-issued license would skip notify() with no
 * error, no log, nothing — exactly the "resend returns skipped/skipped"
 * incident this task exists to prevent, just one hop earlier in the chain.
 *
 * The dependency is now required (`@Inject(LicenseNotificationService)`, no
 * `@Optional()`), so a broken wiring fails module compilation instead of
 * degrading silently at runtime.
 */
type InjectedDeps = { notifications?: LicenseNotificationService };

describe("GuruLicenseWebhookService DI wiring (module compile)", () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("resolves a real LicenseNotificationService instance via Nest DI, not undefined", async () => {
    moduleRef = await Test.createTestingModule({ imports: [LicensingModule] })
      .overrideProvider(RUNTIME_ENV)
      .useValue({ NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3000" })
      .compile();

    const webhookService = moduleRef.get(GuruLicenseWebhookService);
    const notifications = moduleRef.get(LicenseNotificationService);

    expect(notifications).toBeInstanceOf(LicenseNotificationService);
    expect((webhookService as unknown as InjectedDeps).notifications).toBe(
      notifications,
    );
  });
});
