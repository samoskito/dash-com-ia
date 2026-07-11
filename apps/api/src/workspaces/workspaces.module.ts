import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { BackofficeWorkspacesController } from "./backoffice-workspaces.controller";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";
import { PlatformWorkspaceAccessService } from "./platform-workspace-access.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkspacesController, BackofficeWorkspacesController],
  providers: [WorkspacesService, PlatformWorkspaceAccessService],
  exports: [WorkspacesService]
})
export class WorkspacesModule {}
