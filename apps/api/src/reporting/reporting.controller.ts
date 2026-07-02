import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query
} from "@nestjs/common";
import { canManageIntegrations } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { MetaReportSyncQueueService } from "./meta-report-sync-queue.service";
import { MetaReportingService } from "./meta-reporting.service";

@Controller("reports")
export class ReportingController {
  constructor(
    @Inject(MetaReportingService)
    private readonly metaReportingService: MetaReportingService,
    @Inject(MetaReportSyncQueueService)
    private readonly metaReportSyncQueueService: MetaReportSyncQueueService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  @Get("campaigns")
  async getCampaignReports(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.metaReportingService.getCampaignReportOverview({
      workspaceId,
      since,
      until,
      rangeLabel: this.rangeLabel(since, until)
    });
  }

  @Get("adsets")
  async getAdSetReports(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.metaReportingService.getAdSetReportOverview({
      workspaceId,
      since,
      until,
      rangeLabel: this.rangeLabel(since, until)
    });
  }

  @Get("ads")
  async getAdReports(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.metaReportingService.getAdReportOverview({
      workspaceId,
      since,
      until,
      rangeLabel: this.rangeLabel(since, until)
    });
  }

  @Post("meta/sync")
  async syncMetaReports(
    @AuthToken() refreshToken: string,
    @Query("since") since = this.defaultSince(),
    @Query("until") until = this.defaultUntil()
  ) {
    const workspace = await this.getCurrentWorkspace(refreshToken);

    if (!canManageIntegrations(workspace.role)) {
      throw new ForbiddenException("Sem permissao para sincronizar relatorios");
    }

    return this.metaReportSyncQueueService.enqueueSync({
      workspaceId: workspace.id,
      since,
      until
    });
  }

  @Get("meta/structure")
  async getMetaStructure(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.metaReportingService.getMetaStructureReport(workspaceId);
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const workspace = await this.getCurrentWorkspace(refreshToken);

    return workspace.id;
  }

  private async getCurrentWorkspace(refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.getCurrentWorkspace(authenticated);
  }

  private defaultSince(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);

    return date.toISOString().slice(0, 10);
  }

  private defaultUntil(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private rangeLabel(since?: string, until?: string): string {
    return since && until ? `${since} a ${until}` : "Ultimos 7 dias";
  }
}
