import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put
} from "@nestjs/common";
import {
  canManageIntegrations,
  conversionRuleCreateInputSchema,
  conversionRuleUpdateInputSchema,
  conversionTriggerEvaluationInputSchema,
  funnelConfigurationUpdateInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { ConversionRulesService } from "./conversion-rules.service";
import { FunnelConfigurationService } from "./funnel-configuration.service";

@Controller("conversion-rules")
export class ConversionRulesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(ConversionRulesService)
    private readonly conversionRulesService: ConversionRulesService,
    @Inject(FunnelConfigurationService)
    private readonly funnelConfigurationService: FunnelConfigurationService
  ) {}

  @Get()
  async list(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.conversionRulesService.listRules(workspaceId);
  }

  @Get("funnel")
  async getFunnelConfiguration(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.funnelConfigurationService.getConfiguration(workspaceId);
  }

  @Put("funnel")
  async updateFunnelConfiguration(
    @AuthToken() refreshToken: string,
    @Body() body: unknown
  ) {
    const parsed = funnelConfigurationUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!canManageIntegrations(workspace.role)) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.funnelConfigurationService.updateConfiguration(
      workspace.id,
      parsed.data,
      authenticated.user.id
    );
  }

  @Post()
  async create(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = conversionRuleCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!canManageIntegrations(workspace.role)) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.conversionRulesService.createRule(
      workspace.id,
      parsed.data,
      authenticated.user.id
    );
  }

  @Patch(":id")
  async update(
    @AuthToken() refreshToken: string,
    @Param("id") ruleId: string,
    @Body() body: unknown
  ) {
    const parsed = conversionRuleUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!canManageIntegrations(workspace.role)) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.conversionRulesService.updateRule(
      workspace.id,
      ruleId,
      parsed.data,
      authenticated.user.id
    );
  }

  @Post("evaluate")
  async evaluate(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = conversionTriggerEvaluationInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.conversionRulesService.evaluateTriggers(
      workspaceId,
      parsed.data
    );
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return workspace.id;
  }
}
