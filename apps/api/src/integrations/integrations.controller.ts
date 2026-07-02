import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { metaOAuthCallbackQuerySchema } from "@wpptrack/shared";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService)
    private readonly integrationsService: IntegrationsService
  ) {}

  @Get("health")
  getHealth() {
    return this.integrationsService.getHealthSummary();
  }

  @Get("meta/start")
  startMeta() {
    return this.integrationsService.getMetaStartAction();
  }

  @Get("meta/callback")
  handleMetaCallback(@Query() query: Record<string, unknown>) {
    const input = this.parseBody(metaOAuthCallbackQuerySchema.safeParse(query));

    return this.integrationsService.handleMetaCallback(input);
  }

  @Get("uazapi/start")
  startUazapi() {
    return this.integrationsService.getUazapiStartAction();
  }

  @Get("asaas/status")
  getAsaasStatus() {
    return this.integrationsService.getAsaasStatusAction();
  }

  private parseBody<T>(result: { success: true; data: T } | { success: false }): T {
    if (!result.success) {
      throw new BadRequestException("Payload invalido");
    }

    return result.data;
  }
}
