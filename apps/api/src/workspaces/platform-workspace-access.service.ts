import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PlatformSupportContextDto } from "@wpptrack/shared";
import { AuthService } from "../auth/auth.service";
import type { PlatformAdminUser } from "../auth/platform-admin.service";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class PlatformWorkspaceAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  async start(
    refreshToken: string,
    workspaceId: string,
    actor: PlatformAdminUser
  ): Promise<PlatformSupportContextDto> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    const startedAt = new Date();
    await this.authService.setSupportWorkspace(refreshToken, workspace.id);
    await this.prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: actor.id,
        actorType: actor.role,
        action: "platform_support.started",
        targetType: "Workspace",
        targetId: workspace.id,
        resultStatus: "success",
        afterSummary: {
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug
        }
      }
    });

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      startedAt: startedAt.toISOString()
    };
  }

  async stop(
    refreshToken: string,
    actor: PlatformAdminUser
  ): Promise<{ ok: true }> {
    const authenticated = await this.authService.getSession(refreshToken);
    const supportContext = authenticated.supportContext;

    await this.authService.setSupportWorkspace(refreshToken, null);

    if (supportContext) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: supportContext.workspaceId,
          actorUserId: actor.id,
          actorType: actor.role,
          action: "platform_support.ended",
          targetType: "Workspace",
          targetId: supportContext.workspaceId,
          resultStatus: "success",
          beforeSummary: {
            workspaceName: supportContext.workspaceName,
            workspaceSlug: supportContext.workspaceSlug,
            startedAt: supportContext.startedAt
          }
        }
      });
    }

    return { ok: true };
  }
}
