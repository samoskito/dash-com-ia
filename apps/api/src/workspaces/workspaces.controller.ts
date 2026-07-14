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
  Post
} from "@nestjs/common";
import {
  workspaceActiveInputSchema,
  workspaceInviteAcceptInputSchema,
  workspaceInviteInputSchema,
  workspaceMemberManagerUpdateInputSchema,
  workspaceMemberRoleUpdateInputSchema,
  workspaceUpdateInputSchema
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

  @Get()
  async list(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.listAvailableWorkspaces(authenticated);
  }

  @Get("current")
  async current(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.getCurrentWorkspace(authenticated);
  }

  @Post("active")
  @HttpCode(200)
  async setActive(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = workspaceActiveInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    await this.authService.setActiveWorkspace(
      refreshToken,
      parsed.data.workspaceId
    );
    const authenticated = await this.authService.getSession(refreshToken);

    return this.workspacesService.getCurrentWorkspace(authenticated);
  }

  @Patch("current")
  async updateCurrent(
    @AuthToken() refreshToken: string,
    @Body() body: unknown
  ) {
    const parsed = workspaceUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.updateCurrentWorkspace(
      authenticated,
      parsed.data
    );
  }

  @Get("current/members")
  async members(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    return this.workspacesService.listMembers(workspace.id);
  }

  @Get("current/invites")
  async invites(@AuthToken() refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    return this.workspacesService.listInvites(workspace.id);
  }

  @Patch("current/members/:memberId/role")
  async updateMemberRole(
    @AuthToken() refreshToken: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown
  ) {
    const parsed = workspaceMemberRoleUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.updateMemberRole(
      authenticated,
      memberId,
      parsed.data
    );
  }

  @Patch("current/members/:memberId/member-manager")
  async updateMemberManager(
    @AuthToken() refreshToken: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown
  ) {
    const parsed = workspaceMemberManagerUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.updateMemberManagerCapability(
      authenticated,
      memberId,
      parsed.data
    );
  }

  @Delete("current/members/:memberId")
  async removeMember(
    @AuthToken() refreshToken: string,
    @Param("memberId") memberId: string
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.removeMember(authenticated, memberId);
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

  @Post("current/invites/:inviteId/resend")
  async resendInvite(
    @AuthToken() refreshToken: string,
    @Param("inviteId") inviteId: string
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.resendInvite(authenticated, inviteId);
  }

  @Delete("current/invites/:inviteId")
  async revokeInvite(
    @AuthToken() refreshToken: string,
    @Param("inviteId") inviteId: string
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.revokeInvite(authenticated, inviteId);
  }

  @Post("invites/accept")
  async acceptInvite(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = workspaceInviteAcceptInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const accepted = await this.workspacesService.acceptInvite(
      authenticated,
      parsed.data
    );
    await this.authService.setActiveWorkspace(
      refreshToken,
      accepted.workspaceId
    );

    return accepted;
  }
}
