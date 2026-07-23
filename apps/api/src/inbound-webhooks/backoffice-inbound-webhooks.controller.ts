import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  backofficeInboundWebhookDeliveryQuerySchema,
  backofficeInboundWebhookDeliverySummaryQuerySchema,
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { BackofficeInboundWebhooksService } from "./backoffice-inbound-webhooks.service";

type InboundBackofficeRequest = {
  ip?: string;
};

@Controller("backoffice/inbound-webhooks")
export class BackofficeInboundWebhooksController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(BackofficeInboundWebhooksService)
    private readonly inboundWebhooks: BackofficeInboundWebhooksService,
  ) {}

  @Get("scope")
  async getOperationsScope(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    return this.inboundWebhooks.getOperationsScope();
  }

  @Get("deliveries")
  async listDeliveries(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>,
  ) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = backofficeInboundWebhookDeliveryQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.inboundWebhooks.listDeliveries(parsed.data);
  }

  @Get("summary")
  async summarizeDeliveries(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>,
  ) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeInboundWebhookDeliverySummaryQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.inboundWebhooks.summarizeDeliveries(parsed.data);
  }

  @Get("deliveries/:deliveryId/payload")
  async getPayload(
    @AuthToken() refreshToken: string,
    @Param("deliveryId") deliveryId: string,
    @Req() request: InboundBackofficeRequest,
  ) {
    const normalizedDeliveryId = this.deliveryId(deliveryId);
    const owner = await this.assertPayloadOwner(
      refreshToken,
      normalizedDeliveryId,
      request.ip ?? null,
    );

    return this.inboundWebhooks.getPayload(normalizedDeliveryId, {
      id: owner.id,
      actorType: owner.role,
      sourceIp: request.ip ?? null,
    });
  }

  @Post("deliveries/:deliveryId/reprocess-provider-conversions")
  async reprocessProviderConversions(
    @AuthToken() refreshToken: string,
    @Param("deliveryId") deliveryId: string,
    @Req() request: InboundBackofficeRequest,
  ) {
    const owner =
      await this.platformAdminService.assertPlatformOwner(refreshToken);

    return this.inboundWebhooks.reprocessProviderConversions(
      this.deliveryId(deliveryId),
      {
        id: owner.id,
        actorType: owner.role,
        sourceIp: request.ip ?? null,
      },
    );
  }

  private async assertPayloadOwner(
    refreshToken: string,
    deliveryId: string,
    sourceIp: string | null,
  ) {
    try {
      return await this.platformAdminService.assertPlatformOwner(refreshToken);
    } catch (error) {
      try {
        const authenticated = await this.authService.getSession(refreshToken);
        await this.inboundWebhooks.recordDeniedPayloadAccess({
          deliveryId,
          actorUserId: authenticated.user.id,
          actorType: authenticated.user.platformRole ?? "workspace_user",
          sourceIp,
        });
      } catch {
        // Invalid sessions stay denied without creating attacker-controlled logs.
      }

      throw error;
    }
  }

  private deliveryId(value: string): string {
    const normalized = value.trim();

    if (
      !normalized ||
      normalized.length > 255 ||
      /[\u0000-\u001f\u007f]/u.test(normalized)
    ) {
      throw new BadRequestException("Entrega invalida");
    }

    return normalized;
  }
}
