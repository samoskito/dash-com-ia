import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  RawBody,
} from "@nestjs/common";
import { InboundWebhookIngestionService } from "./inbound-webhook-ingestion.service";
import { InboundConversionAutomationIngestionService } from "./inbound-conversion-automation-ingestion.service";

@Controller("webhooks/inbound")
export class InboundWebhookPublicController {
  private readonly logger = new Logger(InboundWebhookPublicController.name);

  constructor(
    @Inject(InboundWebhookIngestionService)
    private readonly ingestion: InboundWebhookIngestionService,
    @Inject(InboundConversionAutomationIngestionService)
    private readonly conversionAutomationIngestion: InboundConversionAutomationIngestionService,
  ) {}

  @Post("conversions/:endpointId")
  @HttpCode(202)
  async receiveConversionAutomation(
    @Param("endpointId") endpointId: string,
    @Query("token") token: unknown,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-attempt") providerAttempt: unknown,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    return this.conversionAutomationIngestion.ingest({
      endpointId,
      token,
      contentType,
      providerAttempt,
      rawBody,
    });
  }

  @Post(":connectionId")
  @HttpCode(202)
  async receive(
    @Param("connectionId") connectionId: string,
    @Query("token") token: unknown,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-attempt") providerAttempt: unknown,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    const startedAt = Date.now();

    try {
      const result = await this.ingestion.ingest({
        connectionId,
        token,
        contentType,
        providerAttempt,
        rawBody,
      });
      const durationMs = Date.now() - startedAt;

      if (durationMs >= 1_000) {
        this.logger.warn(
          JSON.stringify({
            event: "inbound_webhook.accepted_slow",
            connectionId,
            durationMs,
            bodyBytes: rawBody?.length ?? 0,
            queueStatus: result.queueStatus,
          }),
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "inbound_webhook.rejected",
          connectionId,
          statusCode: error instanceof HttpException ? error.getStatus() : 500,
          durationMs: Date.now() - startedAt,
          bodyBytes: rawBody?.length ?? 0,
          contentType: contentType?.split(";", 1)[0] ?? null,
        }),
      );
      throw error;
    }
  }
}
