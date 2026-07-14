import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res
} from "@nestjs/common";
import {
  metaAssetSelectionInputSchema,
  metaCapiTokenInputSchema,
  metaConversionDestinationInputSchema,
  metaOAuthCallbackQuerySchema,
  metaReportingAccountInputSchema,
  metaReportingAccountStatusInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { IntegrationsService } from "./integrations.service";

type HtmlResponse = {
  status(code: number): HtmlResponse;
  type(value: string): HtmlResponse;
};

@Controller("integrations")
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService)
    private readonly integrationsService: IntegrationsService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  @Get("health")
  getHealth() {
    return this.integrationsService.getHealthSummary();
  }

  @Get("pipeline")
  async getPipeline(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getPipelineOverview(workspaceId);
  }

  @Get("whatsapp/source")
  async getWhatsappSource(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getWhatsappDataSource(workspaceId);
  }

  @Get("meta/start")
  async startMeta(
    @AuthToken() refreshToken: string,
    @Query("workspaceId") expectedWorkspaceId?: string
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    if (
      expectedWorkspaceId &&
      expectedWorkspaceId.trim() !== workspace.id
    ) {
      throw new ConflictException(
        "O workspace da sessao mudou. Recarregue a pagina antes de conectar a Meta"
      );
    }

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.getMetaStartAction(
      workspace.id,
      authenticated.user.id
    );
  }

  @Get("meta/callback")
  async handleMetaCallback(
    @Query() query: Record<string, unknown>,
    @Headers("accept") accept: string | undefined,
    @Res({ passthrough: true }) response: HtmlResponse
  ) {
    const wantsHtml = this.wantsHtml(accept);
    const providerError = typeof query.error === "string" ? query.error : null;

    if (providerError) {
      const message =
        typeof query.error_description === "string"
          ? query.error_description
          : `Meta retornou erro: ${providerError}`;

      if (wantsHtml) {
        return this.renderMetaOAuthPopupResult(response, false, message);
      }

      throw new BadRequestException(message);
    }

    const parsed = metaOAuthCallbackQuerySchema.safeParse(query);

    if (!parsed.success) {
      const message = "Retorno OAuth Meta invalido.";

      if (wantsHtml) {
        return this.renderMetaOAuthPopupResult(response, false, message);
      }

      throw new BadRequestException("Payload invalido");
    }

    try {
      const result = await this.integrationsService.handleMetaCallback(parsed.data);
      const connectionPersisted =
        result.status === "connected" &&
        result.connection?.status === "connected";

      if (result.status === "connected" && !connectionPersisted) {
        const message = "Conexao Meta nao foi salva para este workspace.";

        if (wantsHtml) {
          return this.renderMetaOAuthPopupResult(response, false, message);
        }

        throw new BadRequestException(message);
      }

      if (wantsHtml) {
        return this.renderMetaOAuthPopupResult(
          response,
          connectionPersisted,
          result.message ??
            (result.status === "connected"
              ? "Conexao Meta realizada com sucesso."
              : "Falha ao conectar com Meta.")
        );
      }

      return result;
    } catch (error) {
      if (wantsHtml) {
        return this.renderMetaOAuthPopupResult(
          response,
          false,
          error instanceof Error ? error.message : "Falha ao conectar com Meta."
        );
      }

      throw error;
    }
  }

  @Get("meta/connection")
  async getMetaConnection(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getMetaConnection(workspaceId);
  }

  @Get("meta/assets")
  async getMetaAssets(
    @AuthToken() refreshToken: string,
    @Query("businessId") businessId?: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const requestedBusinessId =
      typeof businessId === "string" && businessId.trim() ? businessId.trim() : null;

    return requestedBusinessId
      ? this.integrationsService.getMetaAssets(workspaceId, requestedBusinessId)
      : this.integrationsService.getMetaAssets(workspaceId);
  }

  @Post("meta/assets/refresh")
  async refreshMetaAssets(
    @AuthToken() refreshToken: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const businessId =
      typeof body.businessId === "string" && body.businessId.trim()
        ? body.businessId.trim()
        : null;

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    const assets = await this.integrationsService.refreshMetaAssets(
      workspace.id,
      businessId,
      authenticated.user.id
    );

    if (assets.status === "not_connected") {
      throw new ConflictException(
        "Conecte uma conta Meta neste workspace antes de atualizar os ativos"
      );
    }

    if (assets.status === "needs_reconnect") {
      throw new ConflictException(
        "Reconecte a conta Meta deste workspace antes de atualizar os ativos"
      );
    }

    if (assets.status === "error") {
      throw new BadGatewayException(
        assets.syncError ?? "A Meta nao permitiu atualizar os ativos"
      );
    }

    return assets;
  }

  @Put("meta/assets/selection")
  async saveMetaAssetSelection(
    @AuthToken() refreshToken: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const input = this.parseBody(metaAssetSelectionInputSchema.safeParse(body));

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.saveMetaAssetSelection(
      workspace.id,
      input,
      authenticated.user.id
    );
  }

  @Put("meta/capi-token")
  async saveMetaCapiToken(
    @AuthToken() refreshToken: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const input = this.parseBody(metaCapiTokenInputSchema.safeParse(body));

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.saveMetaCapiToken(
      workspace.id,
      input,
      authenticated.user.id
    );
  }

  @Get("meta/conversion-destination")
  async getMetaConversionDestination(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getMetaConversionDestination(workspaceId);
  }

  @Put("meta/conversion-destination")
  async saveMetaConversionDestination(
    @AuthToken() refreshToken: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const input = this.parseBody(
      metaConversionDestinationInputSchema.safeParse(body)
    );

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.saveMetaConversionDestination(
      workspace.id,
      input,
      authenticated.user.id
    );
  }

  @Get("meta/reporting-accounts")
  async getMetaReportingAccounts(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getMetaReportingAccounts(workspaceId);
  }

  @Post("meta/reporting-accounts")
  async saveMetaReportingAccount(
    @AuthToken() refreshToken: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const input = this.parseBody(metaReportingAccountInputSchema.safeParse(body));

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.saveMetaReportingAccount(
      workspace.id,
      input,
      authenticated.user.id
    );
  }

  @Put("meta/reporting-accounts/:id/status")
  async setMetaReportingAccountActive(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);
    const input = this.parseBody(
      metaReportingAccountStatusInputSchema.safeParse(body)
    );

    if (!workspace.permissions.canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.integrationsService.setMetaReportingAccountActive(
      workspace.id,
      id,
      input.active,
      authenticated.user.id
    );
  }

  @Get("uazapi/start")
  startUazapi() {
    return this.integrationsService.getUazapiStartAction();
  }

  @Get("asaas/status")
  getAsaasStatus() {
    return this.integrationsService.getAsaasStatusAction();
  }

  private parseBody<T>(result: { success: true; data: T } | { success: false }): T {
    if (!result.success) {
      throw new BadRequestException("Payload invalido");
    }

    return result.data;
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const workspace = await this.getCurrentWorkspace(refreshToken);

    return workspace.id;
  }

  private async getCurrentWorkspace(refreshToken: string) {
    const authenticated = await this.authService.getSession(refreshToken);
    return this.workspacesService.getCurrentWorkspace(authenticated);
  }

  private wantsHtml(accept?: string): boolean {
    return typeof accept === "string" && accept.includes("text/html");
  }

  private renderMetaOAuthPopupResult(
    response: HtmlResponse,
    ok: boolean,
    message: string
  ): string {
    const targetOrigin = this.webOrigin();
    const payload = this.safeScriptJson({
      type: "meta_oauth",
      status: ok ? "success" : "error",
      message
    });
    const redirectUrl = this.safeScriptJson(
      `${targetOrigin}/integrations?meta=${ok ? "connected" : "error"}`
    );

    response.status(ok ? 200 : 400).type("text/html; charset=utf-8");

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Meta OAuth</title>
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:#f3f4f6;color:#111827;">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <div style="max-width:420px;border:1px solid #d1d5db;border-radius:12px;background:#fff;padding:24px;text-align:center;">
        <strong>${ok ? "Conexao Meta concluida." : "Falha ao conectar com Meta."}</strong>
        <p>${this.escapeHtml(message)}</p>
      </div>
    </main>
    <script>
      (function () {
        var payload = ${payload};
        var targetOrigin = ${this.safeScriptJson(targetOrigin)};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, targetOrigin);
          }
        } catch (error) {}
        setTimeout(function () {
          try { window.close(); } catch (error) {}
          window.location.href = ${redirectUrl};
        }, 160);
      })();
    </script>
  </body>
</html>`;
  }

  private webOrigin(): string {
    try {
      return new URL(this.envOrDefault("WEB_ORIGIN", "http://localhost:3000")).origin;
    } catch {
      return "http://localhost:3000";
    }
  }

  private envOrDefault(key: string, fallback: string): string {
    const value = process.env[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  }

  private safeScriptJson(value: unknown): string {
    return (JSON.stringify(value) ?? "null").replace(/</g, "\\u003c");
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
