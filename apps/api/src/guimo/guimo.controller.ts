import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspaceOwnerGuard } from "../workspaces/guards/workspace-owner.guard";
import { GuimoService } from "./guimo.service";
import { parseGuimoConfiguration, parseGuimoConfigurationUpdate, parseGuimoConversionRuleCreate, parseGuimoConversionRuleUpdate } from "./guimo.schema";

@Controller()
export class GuimoController {
  constructor(
    @Inject(GuimoService) private readonly guimo: GuimoService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  // Guimo can only configure a target URL, not custom headers: the whole
  // request must be self-authenticating. The token lives in the query
  // string (matching the other URL-only inbound webhooks in this codebase)
  // instead of a header Guimo has no way to send.
  @Post("webhooks/guimo/v1/:integrationId")
  @HttpCode(202)
  receive(
    @Param("integrationId") id: string,
    @Query("token") token: unknown,
    @Body() body: unknown,
  ) {
    return this.guimo.receive(id, token, body);
  }

  @Get("workspaces/:workspaceId/guimo/integrations")
  @UseGuards(WorkspaceOwnerGuard)
  list(@Param("workspaceId") workspaceId: string) {
    return this.guimo.list(workspaceId);
  }

  @Post("workspaces/:workspaceId/guimo/integrations")
  @UseGuards(WorkspaceOwnerGuard)
  async provision(
    @Param("workspaceId") workspaceId: string,
    @AuthToken() token: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.getSession(token);
    const parsed = parseGuimoConfiguration(body);
    if (!parsed) {
      throw new BadRequestException("Payload invalido");
    }
    return this.guimo.provision(workspaceId, session.user.id, parsed);
  }

  @Post(
    "workspaces/:workspaceId/guimo/integrations/:integrationId/rotate-webhook-token",
  )
  @HttpCode(200)
  @UseGuards(WorkspaceOwnerGuard)
  async rotateWebhookToken(
    @Param("workspaceId") workspaceId: string,
    @Param("integrationId") integrationId: string,
    @AuthToken() token: string,
  ) {
    const session = await this.auth.getSession(token);
    return this.guimo.rotateWebhookToken(
      workspaceId,
      integrationId,
      session.user.id,
    );
  }

  @Patch("workspaces/:workspaceId/guimo/integrations/:integrationId")
  @UseGuards(WorkspaceOwnerGuard)
  async update(
    @Param("workspaceId") workspaceId: string,
    @Param("integrationId") integrationId: string,
    @AuthToken() token: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.getSession(token);
    const parsed = parseGuimoConfigurationUpdate(body);
    if (!parsed) {
      throw new BadRequestException("Payload invalido");
    }
    return this.guimo.update(workspaceId, integrationId, session.user.id, parsed);
  }

  @Post("workspaces/:workspaceId/guimo/integrations/:integrationId/active")
  @HttpCode(200)
  @UseGuards(WorkspaceOwnerGuard)
  async setActive(
    @Param("workspaceId") workspaceId: string,
    @Param("integrationId") integrationId: string,
    @AuthToken() token: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.getSession(token);
    const active =
      Boolean(body) &&
      typeof body === "object" &&
      (body as Record<string, unknown>).active === true;
    return this.guimo.setActive(
      workspaceId,
      integrationId,
      session.user.id,
      active,
    );
  }

  @Post("workspaces/:workspaceId/guimo/integrations/:integrationId/rules")
  @UseGuards(WorkspaceOwnerGuard)
  async createRule(@Param("workspaceId") workspaceId: string, @Param("integrationId") integrationId: string, @AuthToken() token: string, @Body() body: unknown) {
    const parsed = parseGuimoConversionRuleCreate(body);
    if (!parsed) throw new BadRequestException("Payload invalido");
    return this.guimo.createRule(workspaceId, integrationId, (await this.auth.getSession(token)).user.id, parsed);
  }

  @Patch("workspaces/:workspaceId/guimo/integrations/:integrationId/rules/:ruleId")
  @UseGuards(WorkspaceOwnerGuard)
  async updateRule(@Param("workspaceId") workspaceId: string, @Param("integrationId") integrationId: string, @Param("ruleId") ruleId: string, @AuthToken() token: string, @Body() body: unknown) {
    const parsed = parseGuimoConversionRuleUpdate(body);
    if (!parsed) throw new BadRequestException("Payload invalido");
    return this.guimo.updateRule(workspaceId, integrationId, ruleId, (await this.auth.getSession(token)).user.id, parsed);
  }

  @Delete("workspaces/:workspaceId/guimo/integrations/:integrationId/rules/:ruleId")
  @UseGuards(WorkspaceOwnerGuard)
  async deleteRule(@Param("workspaceId") workspaceId: string, @Param("integrationId") integrationId: string, @Param("ruleId") ruleId: string, @AuthToken() token: string) {
    return this.guimo.deleteRule(workspaceId, integrationId, ruleId, (await this.auth.getSession(token)).user.id);
  }
}
