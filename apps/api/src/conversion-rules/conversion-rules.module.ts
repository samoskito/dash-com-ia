import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { ConversionCatalogService } from "./conversion-catalog.service";
import { ConversionRulesController } from "./conversion-rules.controller";
import { ConversionRulesService } from "./conversion-rules.service";
import { FunnelConfigurationService } from "./funnel-configuration.service";
import { ProviderConversionRulesService } from "./provider-conversion-rules.service";
import { ProviderConversionObservationService } from "./provider-conversion-observation.service";

@Module({
  imports: [AuthModule, PrismaModule, RuntimeModule, WorkspacesModule],
  controllers: [ConversionRulesController],
  providers: [
    ConversionRulesService,
    ConversionCatalogService,
    FunnelConfigurationService,
    ProviderConversionRulesService,
    ProviderConversionObservationService,
  ],
  exports: [
    ConversionRulesService,
    ConversionCatalogService,
    FunnelConfigurationService,
    ProviderConversionRulesService,
    ProviderConversionObservationService,
  ],
})
export class ConversionRulesModule {}
