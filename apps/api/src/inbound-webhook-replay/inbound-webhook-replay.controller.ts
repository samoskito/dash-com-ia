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
import { backofficeInboundWebhookReplayConfirmationInputSchema } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { InboundWebhookReplayService } from "./inbound-webhook-replay.service";

type ReplayBackofficeRequest = {
  ip?: string;
};

@Controller("backoffice/inbound-webhooks")
export class InboundWebhookReplayController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdmin: PlatformAdminService,
    @Inject(InboundWebhookReplayService)
    private readonly replay: InboundWebhookReplayService,
  ) {}

  @Post("parser-releases/:releaseId/certify")
  async certifyParser(
    @AuthToken() refreshToken: string,
    @Param("releaseId") releaseId: string,
    @Req() request: ReplayBackofficeRequest,
  ) {
    const owner = await this.platformAdmin.assertPlatformOwner(refreshToken);

    return this.replay.certifyParserRelease(
      this.identifier(releaseId, "Parser invalido"),
      owner,
      request.ip ?? null,
    );
  }

  @Get("connections/:connectionId/replay-preview")
  async getPreview(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
  ) {
    await this.platformAdmin.assertPlatformOwner(refreshToken);

    return this.replay.getPreview(
      this.identifier(connectionId, "Conexao invalida"),
    );
  }

  @Post("connections/:connectionId/replay")
  async createReplay(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
    @Body() body: unknown,
    @Req() request: ReplayBackofficeRequest,
  ) {
    const owner = await this.platformAdmin.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeInboundWebhookReplayConfirmationInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Confirmacao invalida");
    }

    return this.replay.authorizeReplay(
      this.identifier(connectionId, "Conexao invalida"),
      parsed.data.confirmation,
      owner,
      request.ip ?? null,
    );
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
