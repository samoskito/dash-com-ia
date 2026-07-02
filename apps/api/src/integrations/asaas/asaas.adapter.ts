import { Inject, Injectable } from "@nestjs/common";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto
} from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

@Injectable()
export class AsaasAdapter implements IntegrationAdapter {
  readonly provider = "asaas" as const;

  constructor(
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env
  ) {}

  async getHealth(): Promise<IntegrationHealthDto> {
    const hasCredentials = Boolean(this.env.ASAAS_BASE_URL && this.env.ASAAS_API_KEY);

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials ? undefined : "Missing ASAAS_BASE_URL or ASAAS_API_KEY"
    };
  }
}
