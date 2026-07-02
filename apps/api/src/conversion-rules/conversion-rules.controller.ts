import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import {
  conversionRuleCreateInputSchema,
  conversionRuleUpdateInputSchema,
  conversionTriggerEvaluationInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { ConversionRulesService } from "./conversion-rules.service";

@Controller("conversion-rules")
export class ConversionRulesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(ConversionRulesService)
    private readonly conversionRulesService: ConversionRulesService
  ) {}

  @Get()
  async list(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.conversionRulesService.listRules(workspaceId);
  }

  @Post()
  async create(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = conversionRuleCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.conversionRulesService.createRule(workspaceId, parsed.data);
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

    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    return this.conversionRulesService.updateRule(
      workspaceId,
      ruleId,
      parsed.data
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
