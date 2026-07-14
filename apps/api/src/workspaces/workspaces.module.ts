import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { BackofficeWorkspacesController } from "./backoffice-workspaces.controller";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";
import { PlatformWorkspaceAccessService } from "./platform-workspace-access.service";
import { WorkspaceContextService } from "./workspace-context.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkspacesController, BackofficeWorkspacesController],
  providers: [
    WorkspacesService,
    WorkspaceContextService,
    PlatformWorkspaceAccessService
  ],
  exports: [WorkspacesService, WorkspaceContextService]
})
export class WorkspacesModule {}
