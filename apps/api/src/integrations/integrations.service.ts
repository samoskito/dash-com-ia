import { Inject, Injectable } from "@nestjs/common";
import type {
  IntegrationHealthSummaryDto,
  IntegrationStartActionDto
} from "@wpptrack/shared";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import type { IntegrationEnv } from "./integration.types";
import { INTEGRATION_ENV } from "./integration.types";
import { MetaAdapter } from "./meta/meta.adapter";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly metaAdapter: MetaAdapter,
    private readonly uazapiAdapter: UazapiAdapter,
    private readonly asaasAdapter: AsaasAdapter,
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env
  ) {}

  async getHealthSummary(): Promise<IntegrationHealthSummaryDto> {
    return {
      checkedAt: new Date().toISOString(),
      providers: await Promise.all([
        this.metaAdapter.getHealth(),
        this.uazapiAdapter.getHealth(),
        this.asaasAdapter.getHealth()
      ])
    };
  }

  getMetaStartAction(): IntegrationStartActionDto {
    const missingEnv = this.missingEnv(["META_APP_ID", "META_APP_SECRET"]);

    if (missingEnv.length > 0) {
      return {
        provider: "meta",
        action: "configure_env",
        label: "Configurar app Meta",
        missingEnv
      };
    }

    return {
      provider: "meta",
      action: "oauth_redirect",
      label: "Conectar Meta via OAuth",
      href: this.env.META_OAUTH_REDIRECT_URL ?? "/integrations/meta/callback",
      missingEnv: []
    };
  }

  getUazapiStartAction(): IntegrationStartActionDto {
    const missingEnv = this.missingEnv(["UAZAPI_BASE_URL", "UAZAPI_TOKEN"]);

    return {
      provider: "uazapi",
      action: missingEnv.length > 0 ? "configure_env" : "wait_webhook",
      label:
        missingEnv.length > 0
          ? "Configurar Uazapi"
          : "Uazapi pronta para provisionar instancia",
      missingEnv
    };
  }

  getAsaasStatusAction(): IntegrationStartActionDto {
    const missingEnv = this.missingEnv(["ASAAS_BASE_URL", "ASAAS_API_KEY"]);

    return {
      provider: "asaas",
      action: missingEnv.length > 0 ? "configure_env" : "wait_webhook",
      label:
        missingEnv.length > 0
          ? "Configurar Asaas"
          : "Asaas pronto para cobrancas e webhooks",
      missingEnv
    };
  }

  private missingEnv(keys: string[]): string[] {
    return keys.filter((key) => !this.env[key]);
  }
}
