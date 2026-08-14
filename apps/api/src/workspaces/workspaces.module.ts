import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { BackofficeWorkspacesController } from "./backoffice-workspaces.controller";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";
import { PlatformWorkspaceAccessService } from "./platform-workspace-access.service";
import { WorkspaceContextService } from "./workspace-context.service";
import { WorkspaceAccessPolicyService } from "./workspace-access-policy.service";
import { ClientSwapModule } from "./client-swap/client-swap.module";

@Module({
  imports: [AuthModule, PrismaModule, ClientSwapModule],
  controllers: [WorkspacesController, BackofficeWorkspacesController],
  providers: [
    WorkspacesService,
    WorkspaceAccessPolicyService,
    WorkspaceContextService,
    PlatformWorkspaceAccessService
  ],
  exports: [
    WorkspacesService,
    WorkspaceAccessPolicyService,
    WorkspaceContextService
  ]
})
export class WorkspacesModule {}
