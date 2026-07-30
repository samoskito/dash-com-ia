import {
  BadRequestException,
  Body,
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
  backofficeInboundWebhookParserRecoveryInputSchema,
  backofficeProviderConversionRolloutModeInputSchema,
  backofficeProviderConversionRolloutQuerySchema,
  backofficeProviderConversionReevaluationInputSchema,
  backofficeProviderConversionTraceQuerySchema,
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { ProviderConversionTraceService } from "../conversion-rules/provider-conversion-trace.service";
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
    @Inject(ProviderConversionTraceService)
    private readonly conversionTraces: ProviderConversionTraceService,
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

  @Get("connections/:connectionId/parser-recovery-preview")
  async getParserRecoveryPreview(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
  ) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);

    return this.inboundWebhooks.getParserRecoveryPreview(
      this.identifier(connectionId, "Conexao invalida"),
    );
  }

  @Post("connections/:connectionId/parser-recovery")
  async reprocessParserBatch(
    @AuthToken() refreshToken: string,
    @Param("connectionId") connectionId: string,
    @Body() body: unknown,
    @Req() request: InboundBackofficeRequest,
  ) {
    const owner =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeInboundWebhookParserRecoveryInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Recuperacao de parser invalida");
    }

    return this.inboundWebhooks.reprocessParserBatch(
      this.identifier(connectionId, "Conexao invalida"),
      parsed.data,
      {
        id: owner.id,
        actorType: owner.role,
        sourceIp: request.ip ?? null,
      },
    );
  }

  @Get("conversion-traces")
  async listConversionTraces(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>,
  ) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeProviderConversionTraceQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.conversionTraces.listLatestTraces(parsed.data);
  }

  @Get("conversion-rollout/channels/:channelId")
  async getProviderConversionRollout(
    @AuthToken() refreshToken: string,
    @Param("channelId") channelId: string,
    @Query() query: Record<string, unknown>,
  ) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeProviderConversionRolloutQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException("Filtros de rollout invalidos");
    }

    return this.inboundWebhooks.getProviderConversionRollout(
      this.identifier(channelId, "Canal invalido"),
      parsed.data,
    );
  }

  @Post("conversion-rollout/channels/:channelId/mode")
  async updateProviderConversionEngineMode(
    @AuthToken() refreshToken: string,
    @Param("channelId") channelId: string,
    @Body() body: unknown,
    @Req() request: InboundBackofficeRequest,
  ) {
    const owner =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeProviderConversionRolloutModeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Alteracao de rollout invalida");
    }

    return this.inboundWebhooks.updateProviderConversionEngineMode(
      this.identifier(channelId, "Canal invalido"),
      parsed.data,
      {
        id: owner.id,
        actorType: owner.role,
        sourceIp: request.ip ?? null,
      },
    );
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

  @Post("conversion-traces/:decisionId/reevaluate")
  async reevaluateProviderConversionDecision(
    @AuthToken() refreshToken: string,
    @Param("decisionId") decisionId: string,
    @Body() body: unknown,
    @Req() request: InboundBackofficeRequest,
  ) {
    const owner =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed =
      backofficeProviderConversionReevaluationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Solicitacao de reavaliacao invalida");
    }

    return this.inboundWebhooks.reevaluateProviderConversionDecision(
      this.identifier(decisionId, "Decisao invalida"),
      parsed.data.requestKey,
      {
        id: owner.id,
        actorType: owner.role,
        sourceIp: request.ip ?? null,
      },
    );
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

  @Post("deliveries/:deliveryId/reprocess-parser")
  async reprocessParser(
    @AuthToken() refreshToken: string,
    @Param("deliveryId") deliveryId: string,
    @Req() request: InboundBackofficeRequest,
  ) {
    const owner =
      await this.platformAdminService.assertPlatformOwner(refreshToken);

    return this.inboundWebhooks.reprocessParser(this.deliveryId(deliveryId), {
      id: owner.id,
      actorType: owner.role,
      sourceIp: request.ip ?? null,
    });
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
    return this.identifier(value, "Entrega invalida");
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
