import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
} from "@nestjs/common";
import { leadListQuerySchema } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { LeadsService } from "./leads.service";

@Controller("leads")
export class LeadsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(LeadsService) private readonly leadsService: LeadsService,
  ) {}

  @Get()
  async list(@AuthToken() refreshToken: string, @Query() query: unknown) {
    const parsed = leadListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Query invalida");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return this.leadsService.listLeads(workspace.id, parsed.data);
  }

  @Get("page")
  async listPage(@AuthToken() refreshToken: string, @Query() query: unknown) {
    const parsed = leadListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Query invalida");
    }

    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return this.leadsService.listLeadsPage(workspace.id, parsed.data);
  }

  @Get(":leadId")
  async detail(
    @AuthToken() refreshToken: string,
    @Param("leadId") leadId: string,
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return this.leadsService.getLeadDetail(workspace.id, leadId);
  }
}
