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
  Req,
} from "@nestjs/common";
import { InboundWebhookIngestionService } from "./inbound-webhook-ingestion.service";
import { InboundConversionAutomationIngestionService } from "./inbound-conversion-automation-ingestion.service";

type InboundWebhookRequest = {
  body?: unknown;
  rawBody?: Buffer;
};

export function resolveInboundRawBody(
  rawBody: Buffer | undefined,
  req: InboundWebhookRequest,
): Buffer | undefined {
  if (rawBody && rawBody.length > 0) {
    return rawBody;
  }
  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    return Buffer.from(req.body, "utf8");
  }
  if (req.body && typeof req.body === "object") {
    const serializedBody = JSON.stringify(req.body);
    if (serializedBody) {
      return Buffer.from(serializedBody, "utf8");
    }
  }
  return rawBody;
}

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
    @Req() req: InboundWebhookRequest,
  ) {
    return this.conversionAutomationIngestion.ingest({
      endpointId,
      token,
      contentType,
      providerAttempt,
      rawBody: resolveInboundRawBody(rawBody, req),
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
    @Req() req: InboundWebhookRequest,
  ) {
    const startedAt = Date.now();
    const resolvedRawBody = resolveInboundRawBody(rawBody, req);

    try {
      const result = await this.ingestion.ingest({
        connectionId,
        token,
        contentType,
        providerAttempt,
        rawBody: resolvedRawBody,
      });
      const durationMs = Date.now() - startedAt;

      if (durationMs >= 1_000) {
        this.logger.warn(
          JSON.stringify({
            event: "inbound_webhook.accepted_slow",
            connectionId,
            durationMs,
            bodyBytes: resolvedRawBody?.length ?? 0,
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
          bodyBytes: resolvedRawBody?.length ?? 0,
          contentType: contentType?.split(";", 1)[0] ?? null,
        }),
      );
      throw error;
    }
  }
}
