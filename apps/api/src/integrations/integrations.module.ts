import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import { INTEGRATION_ENV } from "./integration.types";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { MetaAdapter } from "./meta/meta.adapter";
import { MetaAssetsService } from "./meta/meta-assets.service";
import { MetaConnectionsService } from "./meta/meta-connections.service";
import { MetaTokenEncryptionService } from "./meta/meta-token-encryption.service";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";
import { WhatsappConnectionsController } from "./whatsapp-connections.controller";
import { WhatsappConnectionsService } from "./whatsapp-connections.service";

export { INTEGRATION_ENV } from "./integration.types";

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule],
  providers: [
    {
      provide: INTEGRATION_ENV,
      useValue: process.env
    },
    MetaAdapter,
    MetaAssetsService,
    MetaTokenEncryptionService,
    MetaConnectionsService,
    UazapiAdapter,
    AsaasAdapter,
    IntegrationsService,
    WhatsappConnectionsService
  ],
  controllers: [IntegrationsController, WhatsappConnectionsController],
  exports: [
    MetaAdapter,
    MetaAssetsService,
    MetaTokenEncryptionService,
    MetaConnectionsService,
    UazapiAdapter,
    AsaasAdapter,
    IntegrationsService,
    WhatsappConnectionsService
  ]
})
export class IntegrationsModule {}
