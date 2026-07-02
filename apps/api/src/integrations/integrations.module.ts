import { Module } from "@nestjs/common";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import { MetaAdapter } from "./meta/meta.adapter";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";

@Module({
  providers: [MetaAdapter, UazapiAdapter, AsaasAdapter],
  exports: [MetaAdapter, UazapiAdapter, AsaasAdapter]
})
export class IntegrationsModule {}
