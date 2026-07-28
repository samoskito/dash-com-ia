import { Injectable } from "@nestjs/common";
import type { WorkspaceBillingProfile } from "@prisma/client";
import { PackageBillingConfiguration } from "./package-billing.configuration";

type JsonRecord = Record<string, unknown>;

export type AsaasCustomerResult = {
  id: string;
  cityId: number;
};

export type AsaasRecurringCheckoutResult = {
  id: string;
  link: string;
  status: string | null;
  expiresAt: Date | null;
};

export type AsaasSubscriptionResult = {
  id: string;
  status: string;
  billingType: string | null;
  nextDueDate: string | null;
  externalReference: string | null;
  deleted: boolean;
};

export type AsaasPaymentResult = {
  id: string;
  status: string;
  value: number;
  billingType: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  subscriptionId: string | null;
  externalReference: string | null;
};

export type AsaasInvoiceResult = {
  id: string;
  status: string | null;
  paymentId: string | null;
  externalReference: string | null;
};

export class PackageAsaasError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number | null,
    readonly retryable: boolean,
    readonly description: string | null = null
  ) {
    super(code);
    this.name = "PackageAsaasError";
  }
}

@Injectable()
export class PackageAsaasAdapter {
  constructor(
    private readonly configuration: PackageBillingConfiguration
  ) {}

  isConfigured(): boolean {
    return this.configuration.asaasApiKey() !== null;
  }

  async createCustomer(
    workspaceId: string,
    profile: WorkspaceBillingProfile
  ): Promise<AsaasCustomerResult> {
    const response = await this.request("POST", "/customers", {
      name: profile.payerName,
      cpfCnpj: this.digits(profile.taxId),
      email: profile.billingEmail,
      mobilePhone: this.digits(profile.phone),
      address: profile.addressLine,
      addressNumber: profile.addressNumber,
      complement: profile.addressComplement ?? undefined,
      province: profile.district,
      postalCode: this.digits(profile.postalCode),
      externalReference: this.customerExternalReference(workspaceId),
      notificationDisabled: false
    });

    return this.mapCustomer(response);
  }

  async findCustomerByExternalReference(
    workspaceId: string
  ): Promise<AsaasCustomerResult | null> {
    const externalReference = this.customerExternalReference(workspaceId);
    const query = new URLSearchParams({
      externalReference,
      limit: "10",
      offset: "0"
    });
    const response = await this.request(
      "GET",
      `/customers?${query.toString()}`
    );
    const data = Array.isArray(response.data) ? response.data : [];
    const customer = data
      .filter(this.isRecord)
      .find(
        (item) =>
          this.optionalString(item, "externalReference") ===
          externalReference
      );

    return customer ? this.mapCustomer(customer) : null;
  }

  async updateCustomer(
    customerId: string,
    workspaceId: string,
    profile: WorkspaceBillingProfile
  ): Promise<AsaasCustomerResult> {
    const response = await this.request(
      "PUT",
      `/customers/${encodeURIComponent(customerId)}`,
      {
        name: profile.payerName,
        cpfCnpj: this.digits(profile.taxId),
        email: profile.billingEmail,
        mobilePhone: this.digits(profile.phone),
        address: profile.addressLine,
        addressNumber: profile.addressNumber,
        complement: profile.addressComplement ?? undefined,
        province: profile.district,
        postalCode: this.digits(profile.postalCode),
        externalReference: this.customerExternalReference(workspaceId),
        notificationDisabled: false
      }
    );

    return this.mapCustomer(response);
  }

  async createRecurringCheckout(input: {
    workspaceId: string;
    subscriptionId: string;
    planName: string;
    monthlyPriceCents: number;
    profile: WorkspaceBillingProfile;
    customerCityId: number;
  }): Promise<AsaasRecurringCheckoutResult> {
    const successUrl = this.configuration.checkoutSuccessUrl();
    const cancelUrl = this.configuration.checkoutCancelUrl();

    if (!successUrl || !cancelUrl) {
      throw new PackageAsaasError(
        "asaas_checkout_callback_not_configured",
        null,
        false
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const response = await this.request("POST", "/checkouts", {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 1440,
      externalReference: this.contractExternalReference(
        input.workspaceId,
        input.subscriptionId
      ),
      callback: {
        successUrl,
        cancelUrl,
        expiredUrl: cancelUrl
      },
      items: [
        {
          name: input.planName,
          description: "Assinatura mensal WppTrack",
          quantity: 1,
          value: input.monthlyPriceCents / 100
        }
      ],
      customerData: {
        name: input.profile.payerName,
        cpfCnpj: this.digits(input.profile.taxId),
        email: input.profile.billingEmail,
        phone: this.digits(input.profile.phone),
        address: input.profile.addressLine,
        addressNumber: input.profile.addressNumber,
        complement: input.profile.addressComplement ?? undefined,
        postalCode: this.digits(input.profile.postalCode),
        province: input.profile.district,
        city: input.customerCityId
      },
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: this.asaasDateTime(new Date())
      }
    });

    const id = this.requiredString(response, "id");
    return {
      id,
      link:
        this.optionalString(response, "link") ??
        `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(id)}`,
      status: this.optionalString(response, "status"),
      expiresAt
    };
  }

  async getSubscription(id: string): Promise<AsaasSubscriptionResult> {
    const response = await this.request(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`
    );
    return this.mapSubscription(response);
  }

  async findSubscriptionByExternalReference(
    externalReference: string
  ): Promise<AsaasSubscriptionResult | null> {
    const query = new URLSearchParams({
      externalReference,
      includeDeleted: "true",
      limit: "10",
      offset: "0"
    });
    const response = await this.request(
      "GET",
      `/subscriptions?${query.toString()}`
    );
    const data = Array.isArray(response.data) ? response.data : [];
    const first = data.find(this.isRecord);
    return first ? this.mapSubscription(first) : null;
  }

  async removeSubscription(id: string): Promise<void> {
    try {
      await this.request(
        "DELETE",
        `/subscriptions/${encodeURIComponent(id)}`
      );
    } catch (error) {
      if (
        error instanceof PackageAsaasError &&
        error.statusCode === 404
      ) {
        return;
      }
      throw error;
    }
  }

  async getPayment(id: string): Promise<AsaasPaymentResult> {
    const response = await this.request(
      "GET",
      `/payments/${encodeURIComponent(id)}`
    );

    return {
      id: this.requiredString(response, "id"),
      status: this.requiredString(response, "status"),
      value: this.optionalNumber(response, "value") ?? 0,
      billingType: this.optionalString(response, "billingType"),
      dueDate: this.optionalString(response, "dueDate"),
      paymentDate: this.optionalString(response, "paymentDate"),
      subscriptionId: this.relationId(response.subscription),
      externalReference: this.optionalString(response, "externalReference")
    };
  }

  async listSubscriptionPayments(
    asaasSubscriptionId: string
  ): Promise<AsaasPaymentResult[]> {
    const response = await this.request(
      "GET",
      `/subscriptions/${encodeURIComponent(
        asaasSubscriptionId
      )}/payments?limit=100&offset=0`
    );
    const data = Array.isArray(response.data) ? response.data : [];
    return data
      .filter(this.isRecord)
      .map((payment) => this.mapPayment(payment));
  }

  async upsertAutomaticInvoiceSettings(input: {
    asaasSubscriptionId: string;
    municipalServiceId: string | null;
    municipalServiceCode: string | null;
    observations: string | null;
    taxes: JsonRecord;
  }): Promise<JsonRecord> {
    const path = `/subscriptions/${encodeURIComponent(
      input.asaasSubscriptionId
    )}/invoiceSettings`;
    const body = {
      municipalServiceId: input.municipalServiceId ?? undefined,
      municipalServiceCode: input.municipalServiceCode ?? undefined,
      effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
      receivedOnly: true,
      observations: input.observations ?? undefined,
      taxes: input.taxes
    };

    try {
      await this.request("GET", path);
      return this.request("PUT", path, body);
    } catch (error) {
      if (
        error instanceof PackageAsaasError &&
        error.statusCode === 404
      ) {
        return this.request("POST", path, body);
      }
      throw error;
    }
  }

  async schedulePaymentInvoice(input: {
    paymentId: string;
    externalReference: string;
    serviceDescription: string;
    observations: string | null;
    amountCents: number;
    effectiveDate: string;
    municipalServiceId: string | null;
    municipalServiceCode: string | null;
    taxes: JsonRecord;
  }): Promise<AsaasInvoiceResult> {
    const response = await this.request("POST", "/invoices", {
      payment: input.paymentId,
      externalReference: input.externalReference,
      serviceDescription: input.serviceDescription,
      observations: input.observations ?? "",
      value: input.amountCents / 100,
      deductions: 0,
      effectiveDate: input.effectiveDate,
      municipalServiceId: input.municipalServiceId ?? undefined,
      municipalServiceCode: input.municipalServiceCode ?? undefined,
      municipalServiceName:
        input.municipalServiceId === null
          ? input.municipalServiceCode ?? undefined
          : undefined,
      updatePayment: false,
      taxes: input.taxes
    });
    return this.mapInvoice(response);
  }

  async listSubscriptionInvoices(
    asaasSubscriptionId: string
  ): Promise<AsaasInvoiceResult[]> {
    const response = await this.request(
      "GET",
      `/subscriptions/${encodeURIComponent(
        asaasSubscriptionId
      )}/invoices?limit=100&offset=0`
    );
    return Array.isArray(response.data)
      ? response.data.filter(this.isRecord).map((invoice) =>
          this.mapInvoice(invoice)
        )
      : [];
  }

  async findSubscriptionInvoice(
    asaasSubscriptionId: string,
    externalReference: string
  ): Promise<AsaasInvoiceResult | null> {
    const invoices = await this.listSubscriptionInvoices(
      asaasSubscriptionId
    );
    return (
      invoices.find(
        (invoice) => invoice.externalReference === externalReference
      ) ?? null
    );
  }

  contractExternalReference(
    workspaceId: string,
    subscriptionId: string
  ): string {
    return `wpptrack:contract:${workspaceId}:${subscriptionId}`;
  }

  private customerExternalReference(workspaceId: string): string {
    return `wpptrack:workspace:${workspaceId}`;
  }

  parseContractExternalReference(
    value: string | null
  ): { workspaceId: string; subscriptionId: string } | null {
    if (!value) {
      return null;
    }

    const match = /^wpptrack:contract:([^:]+):([^:]+)$/.exec(value);
    return match
      ? { workspaceId: match[1], subscriptionId: match[2] }
      : null;
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: JsonRecord
  ): Promise<JsonRecord> {
    const apiKey = this.configuration.asaasApiKey();
    if (!apiKey) {
      throw new PackageAsaasError("asaas_not_configured", null, false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        `${this.configuration.asaasApiUrl()}${path}`,
        {
          method,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            access_token: apiKey,
            "user-agent": "WppTrack Billing"
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        }
      );
      const payload = await this.readResponse(response);

      if (!response.ok) {
        const providerError = this.extractError(payload, response.status);
        throw new PackageAsaasError(
          providerError.code,
          response.status,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
          providerError.description
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof PackageAsaasError) {
        throw error;
      }

      throw new PackageAsaasError(
        error instanceof Error && error.name === "AbortError"
          ? "asaas_timeout"
          : "asaas_network_error",
        null,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readResponse(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(text);
      return this.isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private extractError(
    payload: JsonRecord,
    status: number
  ): { code: string; description: string | null } {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const first = errors.find(this.isRecord);
    const code = first ? this.optionalString(first, "code") : null;
    const description = first
      ? this.optionalString(first, "description")
      : null;

    return {
      code: code ? `asaas_${code}` : `asaas_http_${status}`,
      description
    };
  }

  private mapSubscription(payload: JsonRecord): AsaasSubscriptionResult {
    return {
      id: this.requiredString(payload, "id"),
      status: this.requiredString(payload, "status"),
      billingType: this.optionalString(payload, "billingType"),
      nextDueDate: this.optionalString(payload, "nextDueDate"),
      externalReference: this.optionalString(payload, "externalReference"),
      deleted: payload.deleted === true
    };
  }

  private mapCustomer(payload: JsonRecord): AsaasCustomerResult {
    return {
      id: this.requiredString(payload, "id"),
      cityId: this.requiredNumber(payload, "city")
    };
  }

  private mapPayment(payload: JsonRecord): AsaasPaymentResult {
    return {
      id: this.requiredString(payload, "id"),
      status: this.requiredString(payload, "status"),
      value: this.optionalNumber(payload, "value") ?? 0,
      billingType: this.optionalString(payload, "billingType"),
      dueDate: this.optionalString(payload, "dueDate"),
      paymentDate:
        this.optionalString(payload, "paymentDate") ??
        this.optionalString(payload, "clientPaymentDate"),
      subscriptionId: this.relationId(payload.subscription),
      externalReference: this.optionalString(payload, "externalReference")
    };
  }

  private mapInvoice(payload: JsonRecord): AsaasInvoiceResult {
    return {
      id: this.requiredString(payload, "id"),
      status: this.optionalString(payload, "status"),
      paymentId:
        this.relationId(payload.payment) ??
        this.optionalString(payload, "payment"),
      externalReference: this.optionalString(payload, "externalReference")
    };
  }

  private requiredString(payload: JsonRecord, key: string): string {
    const value = this.optionalString(payload, key);
    if (!value) {
      throw new PackageAsaasError(
        `asaas_invalid_response_${key}`,
        null,
        false
      );
    }
    return value;
  }

  private optionalString(payload: JsonRecord, key: string): string | null {
    const value = payload[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private optionalNumber(payload: JsonRecord, key: string): number | null {
    const value = payload[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private requiredNumber(payload: JsonRecord, key: string): number {
    const value = this.optionalNumber(payload, key);
    if (value === null) {
      throw new PackageAsaasError(
        `asaas_invalid_response_${key}`,
        null,
        false
      );
    }
    return value;
  }

  private relationId(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (this.isRecord(value)) {
      return this.optionalString(value, "id");
    }
    return null;
  }

  private digits(value: string): string {
    return value.replace(/\D+/g, "");
  }

  private asaasDateTime(value: Date): string {
    return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  }

  private readonly isRecord = (value: unknown): value is JsonRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);
}
