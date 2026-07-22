import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { backofficeInboundWebhookProductionRecoveryInputSchema } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { BackofficeInboundWebhookRecoveryService } from "./backoffice-inbound-webhook-recovery.service";

type RecoveryBackofficeRequest = {
  ip?: string;
};

@Controller("backoffice/inbound-webhooks")
export class BackofficeInboundWebhookRecoveryController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdmin: PlatformAdminService,
    @Inject(BackofficeInboundWebhookRecoveryService)
    private readonly recovery: BackofficeInboundWebhookRecoveryService,
  ) {}

  @Get("connections/:connectionId/production-recovery-preview")
  async getPreview(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
  ) {
    await this.platformAdmin.assertPlatformOwner(refreshToken);
    return this.recovery.getPreview(
      this.identifier(connectionId, "Conexao invalida"),
    );
  }

  @Post("connections/:connectionId/production-recovery")
  async authorizeRecovery(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
    @Body() body: unknown,
    @Req() request: RecoveryBackofficeRequest,
  ) {
    const owner = await this.platformAdmin.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeInboundWebhookProductionRecoveryInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Confirmacao invalida");
    }

    return this.recovery.authorizeRecovery({
      connectionId: this.identifier(connectionId, "Conexao invalida"),
      channelId: parsed.data.channelId,
      confirmation: parsed.data.confirmation,
      selection: parsed.data.selection,
      actor: owner,
      sourceIp: request.ip ?? null,
    });
  }

  private identifier(value: string, message: string): string {
    const normalized = value.trim();

    if (
      !normalized ||
      normalized.length > 255 ||
      /[\u0000-\u001f\u007f]/u.test(normalized)
    ) {
      throw new BadRequestException(message);
    }

    return normalized;
  }
}
