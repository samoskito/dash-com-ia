import { describe, expect, it } from "vitest";
import { PackageBillingConfiguration } from "../src/billing/package-billing.configuration";

describe("PackageBillingConfiguration", () => {
  it("keeps every package rollout flag disabled by default", () => {
    const configuration = new PackageBillingConfiguration({});

    expect(configuration.isPackageBillingEnabled()).toBe(false);
    expect(configuration.isEnforcementEnabled()).toBe(false);
    expect(configuration.isAsaasRecurringEnabled()).toBe(false);
    expect(configuration.isLifecycleEnabled()).toBe(false);
    expect(configuration.isFiscalEnabled()).toBe(false);
    expect(configuration.isUazapiProvisioningEnabled()).toBe(false);
    expect(configuration.isExternalChannelEnforcementEnabled()).toBe(false);
    expect(configuration.isLegacyBackfillEnabled()).toBe(false);
  });

  it("prefers the package aliases but remains compatible with existing Asaas variables", () => {
    const existing = new PackageBillingConfiguration({
      ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3/",
      ASAAS_WEBHOOK_AUTH_TOKEN: "existing-webhook-token",
    });
    const explicit = new PackageBillingConfiguration({
      ASAAS_API_URL: "https://api.asaas.com/v3/",
      ASAAS_BASE_URL: "https://sandbox.asaas.com/api/v3",
      ASAAS_WEBHOOK_TOKEN: "package-webhook-token",
      ASAAS_WEBHOOK_AUTH_TOKEN: "existing-webhook-token",
    });

    expect(existing.asaasApiUrl()).toBe(
      "https://api-sandbox.asaas.com/v3"
    );
    expect(existing.asaasWebhookToken()).toBe("existing-webhook-token");
    expect(explicit.asaasApiUrl()).toBe("https://api.asaas.com/v3");
    expect(explicit.asaasWebhookToken()).toBe("package-webhook-token");
  });
});
