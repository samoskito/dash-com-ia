import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post
} from "@nestjs/common";
import {
  workspaceInviteAcceptInputSchema,
  workspaceInviteInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  @Get("current")
  async current(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.getCurrentWorkspace(authenticated);
  }

  @Get("current/members")
  async members(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    return this.workspacesService.listMembers(workspace.id);
  }

  @Post("current/invites")
  async createInvite(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = workspaceInviteInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.createInvite(authenticated, parsed.data);
  }

  @Post("invites/accept")
  async acceptInvite(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = workspaceInviteAcceptInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.acceptInvite(authenticated, parsed.data);
  }
}
