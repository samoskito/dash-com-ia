import { Inject, Injectable } from "@nestjs/common";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto
} from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

type FetchLike = typeof fetch;

export type UazapiConnectionResult = {
  providerInstanceId: string | null;
  connectionStatus:
    | "not_configured"
    | "pending"
    | "qr_required"
    | "connected"
    | "disconnected"
    | "error";
  qrCode: string | null;
  message: string | null;
};

@Injectable()
export class UazapiAdapter implements IntegrationAdapter {
  readonly provider = "uazapi" as const;

  constructor(
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async getHealth(): Promise<IntegrationHealthDto> {
    const hasCredentials = Boolean(this.env.UAZAPI_BASE_URL && this.env.UAZAPI_TOKEN);

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials ? undefined : "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN"
    };
  }

  async getInstanceStatus(instanceRef: string): Promise<UazapiConnectionResult> {
    return this.requestInstance("GET", `/instance/status/${instanceRef}`, instanceRef);
  }

  async connectInstance(instanceRef: string): Promise<UazapiConnectionResult> {
    return this.requestInstance("POST", `/instance/connect/${instanceRef}`, instanceRef);
  }

  async getQr(instanceRef: string): Promise<UazapiConnectionResult> {
    return this.requestInstance("GET", `/instance/qr/${instanceRef}`, instanceRef);
  }

  private async requestInstance(
    method: "GET" | "POST",
    path: string,
    instanceRef: string
  ): Promise<UazapiConnectionResult> {
    if (!this.env.UAZAPI_BASE_URL || !this.env.UAZAPI_TOKEN) {
      return {
        providerInstanceId: instanceRef,
        connectionStatus: "not_configured",
        qrCode: null,
        message: "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN"
      };
    }

    try {
      const response = await this.fetchImpl(
        `${this.env.UAZAPI_BASE_URL.replace(/\/$/, "")}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.env.UAZAPI_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        return {
          providerInstanceId: instanceRef,
          connectionStatus: "error",
          qrCode: null,
          message: this.asString(payload.message) ?? `Uazapi HTTP ${response.status}`
        };
      }

      return this.toConnectionResult(payload, instanceRef);
    } catch (error) {
      return {
        providerInstanceId: instanceRef,
        connectionStatus: "error",
        qrCode: null,
        message: error instanceof Error ? error.message : "Erro ao chamar Uazapi"
      };
    }
  }

  private toConnectionResult(
    payload: Record<string, unknown>,
    fallbackInstanceId: string
  ): UazapiConnectionResult {
    return {
      providerInstanceId:
        this.asString(payload.instanceId) ??
        this.asString(payload.instance_id) ??
        fallbackInstanceId,
      connectionStatus: this.normalizeStatus(payload.status),
      qrCode:
        this.asString(payload.qrCode) ??
        this.asString(payload.qrcode) ??
        this.asString(payload.qr) ??
        null,
      message: this.asString(payload.message)
    };
  }

  private normalizeStatus(value: unknown): UazapiConnectionResult["connectionStatus"] {
    const status = this.asString(value)?.toLowerCase();

    if (!status) {
      return "pending";
    }

    if (["connected", "open", "online", "authenticated"].includes(status)) {
      return "connected";
    }

    if (["qr", "qrcode", "qr_required", "scan_qr"].includes(status)) {
      return "qr_required";
    }

    if (["disconnected", "closed", "offline"].includes(status)) {
      return "disconnected";
    }

    if (["error", "failed"].includes(status)) {
      return "error";
    }

    return "pending";
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }
}
