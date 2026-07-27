import { Inject, Injectable, Optional } from "@nestjs/common";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";

@Injectable()
export class PackageBillingConfiguration {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env
  ) {}

  isPackageBillingEnabled(): boolean {
    return this.boolean("WPPTRACK_PACKAGE_BILLING_ENABLED", false);
  }

  isEnforcementEnabled(): boolean {
    return this.boolean("WPPTRACK_PACKAGE_BILLING_ENFORCEMENT_ENABLED", false);
  }

  isAsaasRecurringEnabled(): boolean {
    return this.boolean("WPPTRACK_ASAAS_RECURRING_ENABLED", false);
  }

  isLifecycleEnabled(): boolean {
    return this.boolean("WPPTRACK_BILLING_LIFECYCLE_ENABLED", false);
  }

  isFiscalEnabled(): boolean {
    return this.boolean("WPPTRACK_ASAAS_FISCAL_ENABLED", false);
  }

  isUazapiProvisioningEnabled(): boolean {
    return this.boolean("WPPTRACK_UAZAPI_PACKAGE_PROVISIONING_ENABLED", false);
  }

  isExternalChannelEnforcementEnabled(): boolean {
    return this.boolean(
      "WPPTRACK_EXTERNAL_CHANNEL_BILLING_ENFORCEMENT_ENABLED",
      false
    );
  }

  isLegacyBackfillEnabled(): boolean {
    return this.boolean("WPPTRACK_BILLING_LEGACY_BACKFILL_ENABLED", false);
  }

  isAsaasReconciliationEnabled(): boolean {
    return this.boolean(
      "WPPTRACK_ASAAS_RECONCILIATION_ENABLED",
      false
    );
  }

  reservationTtlMinutes(): number {
    return this.positiveInteger(
      "WPPTRACK_BILLING_SEAT_RESERVATION_TTL_MINUTES",
      15
    );
  }

  gracePeriodDays(): number {
    return this.positiveInteger("WPPTRACK_BILLING_GRACE_PERIOD_DAYS", 3);
  }

  reconciliationIntervalMs(): number {
    return this.positiveInteger(
      "WPPTRACK_BILLING_RECONCILIATION_INTERVAL_MS",
      300_000
    );
  }

  asaasReconciliationIntervalMs(): number {
    return this.positiveInteger(
      "WPPTRACK_ASAAS_RECONCILIATION_INTERVAL_MS",
      21_600_000
    );
  }

  asaasReconciliationBatchSize(): number {
    return Math.min(
      500,
      this.positiveInteger(
        "WPPTRACK_ASAAS_RECONCILIATION_BATCH_SIZE",
        100
      )
    );
  }

  asaasApiUrl(): string {
    return (
      this.clean(this.env.ASAAS_API_URL) ??
      this.clean(this.env.ASAAS_BASE_URL) ??
      "https://api.asaas.com/v3"
    ).replace(/\/+$/, "");
  }

  asaasApiKey(): string | null {
    return this.clean(this.env.ASAAS_API_KEY);
  }

  asaasWebhookToken(): string | null {
    return (
      this.clean(this.env.ASAAS_WEBHOOK_TOKEN) ??
      this.clean(this.env.ASAAS_WEBHOOK_AUTH_TOKEN)
    );
  }

  checkoutSuccessUrl(): string | null {
    return this.clean(this.env.WPPTRACK_BILLING_CHECKOUT_SUCCESS_URL);
  }

  checkoutCancelUrl(): string | null {
    return this.clean(this.env.WPPTRACK_BILLING_CHECKOUT_CANCEL_URL);
  }

  private boolean(name: string, fallback: boolean): boolean {
    const value = this.clean(this.env[name]);
    return value === null ? fallback : value.toLowerCase() === "true";
  }

  private positiveInteger(name: string, fallback: number): number {
    const value = Number.parseInt(this.env[name] ?? "", 10);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private clean(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
