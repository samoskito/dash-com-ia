import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post
} from "@nestjs/common";
import {
  canManageWorkspaceBilling,
  whatsappInstanceCheckoutInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(BillingService) private readonly billingService: BillingService
  ) {}

  @Get("whatsapp-instance/quote")
  async quote(@AuthToken() refreshToken: string) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);
    return this.billingService.getWhatsappInstanceQuote(workspaceId);
  }

  @Get("subscription")
  async subscription(@AuthToken() refreshToken: string) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);
    return this.billingService.getWorkspaceSubscriptionSummary(workspaceId);
  }

  @Post("whatsapp-instance/checkout")
  async checkout(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = whatsappInstanceCheckoutInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    const { role, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);

    if (!canManageWorkspaceBilling(role)) {
      throw new ForbiddenException("Sem permissao para gerenciar cobranca");
    }

    return this.billingService.createWhatsappInstanceCheckout(
      workspaceId,
      parsed.data,
      userId
    );
  }

  private async getCurrentWorkspaceContext(refreshToken: string): Promise<{
    role: "owner" | "admin" | "member";
    userId: string;
    workspaceId: string;
  }> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return {
      role: workspace.role,
      userId: authenticated.user.id,
      workspaceId: workspace.id
    };
  }
}
