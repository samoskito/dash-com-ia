import { BadRequestException, Body, Controller, Headers, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspaceOwnerGuard } from "../workspaces/guards/workspace-owner.guard";
import { GuimoService } from "./guimo.service";
import { parseGuimoConfiguration } from "./guimo.schema";

@Controller()
export class GuimoController {
  constructor(private readonly guimo: GuimoService, private readonly auth: AuthService) {}
  @Post("webhooks/guimo/v1/:integrationId") @HttpCode(202)
  receive(@Param("integrationId") id: string, @Headers("x-wpptrack-webhook-token") token: unknown, @Body() body: unknown) { return this.guimo.receive(id, token, body); }
  @Post("workspaces/:workspaceId/guimo/integrations") @UseGuards(WorkspaceOwnerGuard)
  async provision(@Param("workspaceId") workspaceId: string, @AuthToken() token: string, @Body() body: unknown) {
    const session = await this.auth.getSession(token);
    const parsed = parseGuimoConfiguration(body);
    if (!parsed) throw new BadRequestException("Payload invalido");
    return this.guimo.provision(workspaceId, session.user.id, parsed);
  }
}
