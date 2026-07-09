import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Res
} from "@nestjs/common";
import { canManageIntegrations } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { MetaReportSyncQueueService } from "./meta-report-sync-queue.service";
import { MetaReportingService } from "./meta-reporting.service";

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

type ReportPeriod = {
  since?: string;
  until?: string;
  rangeLabel: string;
};

type WhatsappClassificationFilter =
  | "whatsapp"
  | "needs_review"
  | "excluded"
  | "all";

type ReportFilters = {
  businessId?: string;
  adAccountId?: string;
  whatsappClassification?: WhatsappClassificationFilter;
};

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
    @Query("until") until?: string,
    @Query("businessId") businessId?: string | string[],
    @Query("adAccountId") adAccountId?: string | string[],
    @Query("whatsappClassification") whatsappClassification?: string | string[]
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const period = this.parseReportPeriod(since, until);
    const filters = this.parseReportFilters({
      businessId,
      adAccountId,
      whatsappClassification
    });

    return this.metaReportingService.getCampaignReportOverview({
      workspaceId,
      since: period.since,
      until: period.until,
      rangeLabel: period.rangeLabel,
      ...filters
    });
  }

  @Get("campaigns/export.csv")
  async exportCampaignReports(
    @AuthToken() refreshToken: string,
    @Res({ passthrough: true }) response: HeaderResponse,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("businessId") businessId?: string | string[],
    @Query("adAccountId") adAccountId?: string | string[],
    @Query("whatsappClassification") whatsappClassification?: string | string[]
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const period = this.parseReportPeriod(since, until);
    const filters = this.parseReportFilters({
      businessId,
      adAccountId,
      whatsappClassification
    });
    const csv = await this.metaReportingService.getCampaignReportCsv({
      workspaceId,
      since: period.since,
      until: period.until,
      rangeLabel: period.rangeLabel,
      ...filters
    });

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${csv.filename}"`
    );

    return csv.content;
  }

  @Get("adsets")
  async getAdSetReports(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("businessId") businessId?: string | string[],
    @Query("adAccountId") adAccountId?: string | string[],
    @Query("whatsappClassification") whatsappClassification?: string | string[]
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const period = this.parseReportPeriod(since, until);
    const filters = this.parseReportFilters({
      businessId,
      adAccountId,
      whatsappClassification
    });

    return this.metaReportingService.getAdSetReportOverview({
      workspaceId,
      since: period.since,
      until: period.until,
      rangeLabel: period.rangeLabel,
      ...filters
    });
  }

  @Get("ads")
  async getAdReports(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("businessId") businessId?: string | string[],
    @Query("adAccountId") adAccountId?: string | string[],
    @Query("whatsappClassification") whatsappClassification?: string | string[]
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const period = this.parseReportPeriod(since, until);
    const filters = this.parseReportFilters({
      businessId,
      adAccountId,
      whatsappClassification
    });

    return this.metaReportingService.getAdReportOverview({
      workspaceId,
      since: period.since,
      until: period.until,
      rangeLabel: period.rangeLabel,
      ...filters
    });
  }

  @Post("meta/sync")
  async syncMetaReports(
    @AuthToken() refreshToken: string,
    @Query("since") since = this.defaultSince(),
    @Query("until") until = this.defaultUntil()
  ) {
    const workspace = await this.getCurrentWorkspace(refreshToken);
    const period = this.parseReportPeriod(since, until);

    if (!canManageIntegrations(workspace.role)) {
      throw new ForbiddenException("Sem permissao para sincronizar relatorios");
    }

    return this.metaReportSyncQueueService.enqueueSync({
      workspaceId: workspace.id,
      since: period.since as string,
      until: period.until as string
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

  private parseReportPeriod(since?: string, until?: string): ReportPeriod {
    if (!since && !until) {
      return {
        rangeLabel: "Ultimos 7 dias"
      };
    }

    if (!this.isDateOnly(since) || !this.isDateOnly(until)) {
      throw new BadRequestException("Periodo invalido");
    }

    if (since > until) {
      throw new BadRequestException("Periodo invalido");
    }

    return {
      since,
      until,
      rangeLabel: `${since} a ${until}`
    };
  }

  private parseReportFilters(input: {
    businessId?: string | string[];
    adAccountId?: string | string[];
    whatsappClassification?: string | string[];
  }): ReportFilters {
    return {
      businessId: this.trimOptional(input.businessId),
      adAccountId: this.trimOptional(input.adAccountId),
      whatsappClassification: this.parseWhatsappClassificationFilter(
        input.whatsappClassification
      )
    };
  }

  private trimOptional(value?: string | string[]): string | undefined {
    if (Array.isArray(value)) {
      throw new BadRequestException("Filtro de relatorio invalido");
    }

    const trimmed = value?.trim();

    return trimmed ? trimmed : undefined;
  }

  private isWhatsappClassificationFilter(
    value: string
  ): value is WhatsappClassificationFilter {
    return ["whatsapp", "needs_review", "excluded", "all"].includes(value);
  }

  private parseWhatsappClassificationFilter(
    value?: string | string[]
  ): WhatsappClassificationFilter | undefined {
    if (Array.isArray(value)) {
      throw new BadRequestException("Filtro de relatorio invalido");
    }

    const trimmed = value?.trim();

    if (!trimmed) {
      return undefined;
    }

    if (this.isWhatsappClassificationFilter(trimmed)) {
      return trimmed;
    }

    throw new BadRequestException("Filtro de classificacao invalido");
  }

  private isDateOnly(value?: string): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }
}
