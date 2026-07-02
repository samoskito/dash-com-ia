import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  RUNTIME_FETCH,
  type RuntimeFetch
} from "../../common/runtime/runtime.module";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto
} from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

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
    @Optional()
    @Inject(RUNTIME_FETCH)
    private readonly fetchImpl: RuntimeFetch = fetch
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
    return this.requestInstance("GET", "/instance/status", instanceRef);
  }

  async connectInstance(instanceRef: string): Promise<UazapiConnectionResult> {
    return this.requestInstance("POST", "/instance/connect", instanceRef);
  }

  async getQr(instanceRef: string): Promise<UazapiConnectionResult> {
    return this.getInstanceStatus(instanceRef);
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
            token: this.env.UAZAPI_TOKEN,
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
    const instance = this.asRecord(payload.instance);
    const status = this.asRecord(payload.status);
    const instanceStatus = this.asString(instance?.status) ?? this.asString(payload.status);
    const qrCode =
      this.asString(instance?.qrcode) ??
      this.asString(instance?.qrCode) ??
      this.asString(payload.qrcode) ??
      this.asString(payload.qrCode) ??
      this.asString(payload.qr) ??
      null;

    return {
      providerInstanceId:
        this.asString(instance?.id) ??
        this.asString(instance?.instanceId) ??
        this.asString(payload.instanceId) ??
        this.asString(payload.instance_id) ??
        fallbackInstanceId,
      connectionStatus: this.normalizeStatus(instanceStatus, status, qrCode),
      qrCode,
      message: this.asString(payload.message)
    };
  }

  private normalizeStatus(
    value: unknown,
    status: Record<string, unknown> | null,
    qrCode: string | null
  ): UazapiConnectionResult["connectionStatus"] {
    if (status?.connected === true || status?.loggedIn === true) {
      return "connected";
    }

    const statusText = this.asString(value)?.toLowerCase();

    if (!statusText) {
      return "pending";
    }

    if (["connected", "open", "online", "authenticated"].includes(statusText)) {
      return "connected";
    }

    if (
      ["qr", "qrcode", "qr_required", "scan_qr"].includes(statusText) ||
      (statusText === "connecting" && qrCode)
    ) {
      return "qr_required";
    }

    if (["disconnected", "closed", "offline", "hibernated"].includes(statusText)) {
      return "disconnected";
    }

    if (["error", "failed"].includes(statusText)) {
      return "error";
    }

    return "pending";
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }
}
