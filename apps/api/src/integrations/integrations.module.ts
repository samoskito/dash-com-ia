import { Module } from "@nestjs/common";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import { INTEGRATION_ENV } from "./integration.types";
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
    AsaasAdapter
  ],
  exports: [MetaAdapter, UazapiAdapter, AsaasAdapter]
})
export class IntegrationsModule {}
