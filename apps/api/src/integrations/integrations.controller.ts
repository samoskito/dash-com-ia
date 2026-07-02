import { Controller, Get, Inject } from "@nestjs/common";
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

  @Get("uazapi/start")
  startUazapi() {
    return this.integrationsService.getUazapiStartAction();
  }

  @Get("asaas/status")
  getAsaasStatus() {
    return this.integrationsService.getAsaasStatusAction();
  }
}
