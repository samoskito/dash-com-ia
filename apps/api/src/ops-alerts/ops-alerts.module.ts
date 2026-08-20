import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { OpsAlertNotifier } from "./ops-alert.notifier";
import { OpsAlertsController } from "./ops-alerts.controller";
import { OpsAlertService } from "./ops-alerts.service";

@Module({ imports: [AuthModule, PrismaModule, IntegrationsModule, WorkspacesModule], controllers: [OpsAlertsController], providers: [OpsAlertNotifier, OpsAlertService], exports: [OpsAlertService] })
export class OpsAlertsModule {}
