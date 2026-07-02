import { Module } from "@nestjs/common";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import { INTEGRATION_ENV } from "./integration.types";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { MetaAdapter } from "./meta/meta.adapter";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";

export { INTEGRATION_ENV } from "./integration.types";

@Module({
  providers: [
    {
      provide: INTEGRATION_ENV,
      useValue: process.env
    },
    MetaAdapter,
    UazapiAdapter,
    AsaasAdapter,
    IntegrationsService
  ],
  controllers: [IntegrationsController],
  exports: [MetaAdapter, UazapiAdapter, AsaasAdapter, IntegrationsService]
})
export class IntegrationsModule {}
