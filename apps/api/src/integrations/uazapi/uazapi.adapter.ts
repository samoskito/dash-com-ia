import { Injectable } from "@nestjs/common";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto
} from "../integration.types";

@Injectable()
export class UazapiAdapter implements IntegrationAdapter {
  readonly provider = "uazapi" as const;

  constructor(private readonly env: IntegrationEnv = process.env) {}

  async getHealth(): Promise<IntegrationHealthDto> {
    const hasCredentials = Boolean(this.env.UAZAPI_BASE_URL && this.env.UAZAPI_TOKEN);

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials ? undefined : "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN"
    };
  }
}
