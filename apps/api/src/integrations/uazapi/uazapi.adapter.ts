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
import type { WhatsappLabelDto } from "@wpptrack/shared";
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

export type UazapiLabelListResult = {
  status: "success" | "not_configured" | "error";
  message: string | null;
  labels: WhatsappLabelDto[];
};

export type UazapiWebhookConfigurationResult = {
  status: "configured" | "not_configured" | "error";
  message: string | null;
};

export type UazapiCreateInstanceInput = {
  name: string;
  localInstanceId: string;
  workspaceId: string;
};

export type UazapiCreateInstanceResult = {
  status: "created" | "not_configured" | "error";
  providerInstanceId: string | null;
  instanceToken: string | null;
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
    const hasCredentials = Boolean(
      this.env.UAZAPI_BASE_URL &&
        (this.env.UAZAPI_ADMIN_TOKEN || this.env.UAZAPI_TOKEN)
    );

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials
        ? undefined
        : "Missing UAZAPI_BASE_URL or UAZAPI_ADMIN_TOKEN"
    };
  }

  async createInstance(
    input: UazapiCreateInstanceInput
  ): Promise<UazapiCreateInstanceResult> {
    if (!this.env.UAZAPI_BASE_URL || !this.env.UAZAPI_ADMIN_TOKEN) {
      return {
        status: "not_configured",
        providerInstanceId: null,
        instanceToken: null,
        message: "Missing UAZAPI_BASE_URL or UAZAPI_ADMIN_TOKEN"
      };
    }

    try {
      const response = await this.fetchImpl(
        `${this.env.UAZAPI_BASE_URL.replace(/\/$/, "")}/instance/create`,
        {
          method: "POST",
          headers: {
            admintoken: this.env.UAZAPI_ADMIN_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: input.name,
            adminField01: input.workspaceId,
            adminField02: input.localInstanceId
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        return {
          status: "error",
          providerInstanceId: null,
          instanceToken: null,
          message: this.asString(payload.message) ?? `Uazapi HTTP ${response.status}`
        };
      }

      const instance = this.asRecord(payload.instance);

      return {
        status: "created",
        providerInstanceId:
          this.asString(instance?.id) ??
          this.asString(payload.instanceId) ??
          this.asString(payload.instance_id),
        instanceToken:
          this.asString(payload.token) ??
          this.asString(payload.instanceToken) ??
          this.asString(payload.instance_token),
        message: this.asString(payload.message)
      };
    } catch (error) {
      return {
        status: "error",
        providerInstanceId: null,
        instanceToken: null,
        message: error instanceof Error ? error.message : "Erro ao chamar Uazapi"
      };
    }
  }

  async getInstanceStatus(
    instanceRef: string,
    instanceToken?: string | null
  ): Promise<UazapiConnectionResult> {
    return this.requestInstance(
      "GET",
      "/instance/status",
      instanceRef,
      instanceToken
    );
  }

  async connectInstance(
    instanceRef: string,
    instanceToken?: string | null
  ): Promise<UazapiConnectionResult> {
    return this.requestInstance(
      "POST",
      "/instance/connect",
      instanceRef,
      instanceToken
    );
  }

  async getQr(
    instanceRef: string,
    instanceToken?: string | null
  ): Promise<UazapiConnectionResult> {
    return this.getInstanceStatus(instanceRef, instanceToken);
  }

  async configureInstanceWebhook(input: {
    instanceToken: string | null;
    webhookUrl: string | null;
  }): Promise<UazapiWebhookConfigurationResult> {
    if (!this.env.UAZAPI_BASE_URL || !input.instanceToken || !input.webhookUrl) {
      return {
        status: "not_configured",
        message: "Missing UAZAPI_BASE_URL, instance token or webhook URL"
      };
    }

    try {
      const response = await this.fetchImpl(
        `${this.env.UAZAPI_BASE_URL.replace(/\/$/, "")}/webhook`,
        {
          method: "POST",
          headers: {
            token: input.instanceToken,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            enabled: true,
            url: input.webhookUrl,
            events: [
              "messages",
              "messages_update",
              "labels",
              "chat_labels",
              "connection"
            ],
            excludeMessages: ["wasSentByApi"],
            addUrlEvents: false,
            addUrlTypesMessages: false
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        return {
          status: "error",
          message:
            this.asString(payload.message) ??
            this.asString(payload.error) ??
            `Uazapi HTTP ${response.status}`
        };
      }

      return {
        status: "configured",
        message: this.asString(payload.message)
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Erro ao chamar Uazapi"
      };
    }
  }

  async listLabels(
    _instanceRef: string,
    instanceToken?: string | null
  ): Promise<UazapiLabelListResult> {
    const token = this.getInstanceToken(instanceToken);

    if (!this.env.UAZAPI_BASE_URL || !token) {
      return {
        status: "not_configured",
        message: "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN",
        labels: []
      };
    }

    try {
      const response = await this.fetchImpl(
        `${this.env.UAZAPI_BASE_URL.replace(/\/$/, "")}/labels`,
        {
          method: "GET",
          headers: {
            token,
            "Content-Type": "application/json"
          }
        }
      );
      const payload = (await response.json().catch(() => [])) as unknown;

      if (!response.ok) {
        const errorPayload = this.asRecord(payload);

        return {
          status: "error",
          message:
            this.asString(errorPayload?.message) ??
            this.asString(errorPayload?.error) ??
            `Uazapi HTTP ${response.status}`,
          labels: []
        };
      }

      return {
        status: "success",
        message: null,
        labels: this.toLabels(payload)
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Erro ao chamar Uazapi",
        labels: []
      };
    }
  }

  private async requestInstance(
    method: "GET" | "POST",
    path: string,
    instanceRef: string,
    instanceToken?: string | null
  ): Promise<UazapiConnectionResult> {
    const token = this.getInstanceToken(instanceToken);

    if (!this.env.UAZAPI_BASE_URL || !token) {
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
            token,
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

  private toLabels(payload: unknown): WhatsappLabelDto[] {
    const items = Array.isArray(payload) ? payload : [];

    return items.flatMap((item) => {
      const label = this.asRecord(item);
      const id = this.asString(label?.id) ?? this.asString(label?.labelid);
      const name = this.asString(label?.name);

      if (!id || !name) {
        return [];
      }

      return [
        {
          id,
          name,
          colorHex: this.asString(label?.colorHex),
          labelId: this.asString(label?.labelid)
        }
      ];
    });
  }

  private getInstanceToken(instanceToken?: string | null): string | undefined {
    return instanceToken ?? this.env.UAZAPI_TOKEN;
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }
}
