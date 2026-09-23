import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_ENV,
  RUNTIME_FETCH,
} from "../src/common/runtime/runtime.module";
import { LicenseClaimCaptchaService } from "../src/licensing/license-claim-captcha.service";
import { LicenseClaimCodeService } from "../src/licensing/license-claim-code.service";
import { LicenseClaimController } from "../src/licensing/license-claim.controller";
import { LicenseClaimService } from "../src/licensing/license-claim.service";
import { LicenseRateLimitService } from "../src/licensing/license-rate-limit.service";
import { LicensingModule } from "../src/licensing/licensing.module";
import { StudentBaseMysqlAdapter } from "../src/licensing/student-base-mysql.adapter";

type ControllerDeps = {
  claims?: LicenseClaimService;
  captcha?: LicenseClaimCaptchaService;
  rateLimit?: LicenseRateLimitService;
};

describe("license claim DI wiring (module compile)", () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("compiles LicensingModule and injects the real claim providers", async () => {
    moduleRef = await Test.createTestingModule({ imports: [LicensingModule] })
      .overrideProvider(RUNTIME_ENV)
      .useValue({
        NODE_ENV: "test",
        WEB_ORIGIN: "http://localhost:3000",
        LICENSE_CLAIM_ENABLED: "false",
      })
      .overrideProvider(RUNTIME_FETCH)
      .useValue(vi.fn())
      .compile();

    const controller = moduleRef.get(LicenseClaimController, { strict: false });
    const claims = moduleRef.get(LicenseClaimService, { strict: false });
    const captcha = moduleRef.get(LicenseClaimCaptchaService, {
      strict: false,
    });
    const rateLimit = moduleRef.get(LicenseRateLimitService, { strict: false });

    expect(controller).toBeInstanceOf(LicenseClaimController);
    expect(claims).toBeInstanceOf(LicenseClaimService);
    expect(captcha).toBeInstanceOf(LicenseClaimCaptchaService);
    expect(rateLimit).toBeInstanceOf(LicenseRateLimitService);
    expect(
      moduleRef.get(LicenseClaimCodeService, { strict: false }),
    ).toBeInstanceOf(LicenseClaimCodeService);
    expect(
      moduleRef.get(StudentBaseMysqlAdapter, { strict: false }),
    ).toBeInstanceOf(StudentBaseMysqlAdapter);

    const dependencies = controller as unknown as ControllerDeps;
    expect(dependencies.claims).toBe(claims);
    expect(dependencies.captcha).toBe(captcha);
    expect(dependencies.rateLimit).toBe(rateLimit);
  });
});
