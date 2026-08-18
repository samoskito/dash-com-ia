import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  RawBody,
} from "@nestjs/common";
import { XmaxIngestService } from "./xmax-ingest.service";

@Controller("webhooks/xmax")
export class XmaxWebhookController {
  private readonly logger = new Logger(XmaxWebhookController.name);

  constructor(
    @Inject(XmaxIngestService)
    private readonly ingestService: XmaxIngestService,
  ) {}

  @Post("accounts/:accountId")
  @HttpCode(202)
  async receive(
    @Param("accountId") accountId: string,
    @Query("token") token: unknown,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-attempt") providerAttempt: unknown,
    @Headers("x-wpptrack-webhook-token") headerToken: unknown,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    const startedAt = Date.now();
    try {
      const result = await this.ingestService.ingest({
        accountId,
        token: headerToken ?? token,
        contentType,
        providerAttempt,
        rawBody,
      });
      return result;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          JSON.stringify({
            event: "xmax_webhook.rejected",
            durationMs: Date.now() - startedAt,
            bodyBytes: rawBody?.length ?? 0,
          }),
        );
      }
      throw error;
    }
  }
}
