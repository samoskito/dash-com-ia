import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  conversionRuleCreateInputSchema,
  conversionRuleUpdateInputSchema,
  conversionTriggerEvaluationInputSchema,
  funnelConfigurationUpdateInputSchema,
  providerConversionRuleCreateInputSchema,
  providerConversionRuleUpdateInputSchema,
  structuredCatalogTestMessageInputSchema,
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { ConversionCatalogService } from "./conversion-catalog.service";
import { ConversionRulesService } from "./conversion-rules.service";
import { FunnelConfigurationService } from "./funnel-configuration.service";
import { ProviderConversionRulesService } from "./provider-conversion-rules.service";

@Controller("conversion-rules")
export class ConversionRulesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(ConversionRulesService)
    private readonly conversionRulesService: ConversionRulesService,
    @Inject(FunnelConfigurationService)
    private readonly funnelConfigurationService: FunnelConfigurationService,
    @Inject(ProviderConversionRulesService)
    private readonly providerConversionRulesService: ProviderConversionRulesService,
    @Inject(ConversionCatalogService)
    private readonly conversionCatalogService: ConversionCatalogService,
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

  @Get("providers")
  async listProviderRules(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.providerConversionRulesService.listRules(workspaceId);
  }

  @Post("providers")
  async createProviderRule(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const context = await this.requireIntegrationManager(refreshToken);
    const parsed = providerConversionRuleCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.providerConversionRulesService.createRule(
      context.workspaceId,
      parsed.data,
      context.userId,
    );
  }

  @Patch("providers/:id")
  async updateProviderRule(
    @AuthToken() refreshToken: string,
    @Param("id") providerRuleId: string,
    @Body() body: unknown,
  ) {
    const context = await this.requireIntegrationManager(refreshToken);
    const parsed = providerConversionRuleUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.providerConversionRulesService.updateRule(
      context.workspaceId,
      providerRuleId,
      parsed.data,
      context.userId,
    );
  }

  @Post("providers/:id/rotate-endpoint")
  @HttpCode(200)
  async rotateProviderRuleEndpoint(
    @AuthToken() refreshToken: string,
    @Param("id") providerRuleId: string,
  ) {
    const context = await this.requireIntegrationManager(refreshToken);
    return this.providerConversionRulesService.rotateEndpoint(
      context.workspaceId,
      providerRuleId,
      context.userId,
    );
  }

  @Post("providers/:id/test-message")
  @HttpCode(200)
  async testProviderCatalogMessage(
    @AuthToken() refreshToken: string,
    @Param("id") providerRuleId: string,
    @Body() body: unknown,
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const parsed = structuredCatalogTestMessageInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.conversionCatalogService.testMessage(
      workspaceId,
      providerRuleId,
      parsed.data,
    );
  }

  @Delete("providers/:id")
  @HttpCode(204)
  async removeProviderRule(
    @AuthToken() refreshToken: string,
    @Param("id") providerRuleId: string,
  ): Promise<void> {
    const context = await this.requireIntegrationManager(refreshToken);
    await this.providerConversionRulesService.removeRule(
      context.workspaceId,
      providerRuleId,
      context.userId,
    );
  }

  @Put("funnel")
  async updateFunnelConfiguration(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const parsed = funnelConfigurationUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.funnelConfigurationService.updateConfiguration(
      workspace.id,
      parsed.data,
      authenticated.user.id,
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

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.conversionRulesService.createRule(
      workspace.id,
      parsed.data,
      authenticated.user.id,
    );
  }

  @Patch(":id")
  async update(
    @AuthToken() refreshToken: string,
    @Param("id") ruleId: string,
    @Body() body: unknown,
  ) {
    const parsed = conversionRuleUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.conversionRulesService.updateRule(
      workspace.id,
      ruleId,
      parsed.data,
      authenticated.user.id,
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
      parsed.data,
    );
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return workspace.id;
  }

  private async requireIntegrationManager(refreshToken: string): Promise<{
    userId: string;
    workspaceId: string;
  }> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return {
      userId: authenticated.user.id,
      workspaceId: workspace.id,
    };
  }
}
