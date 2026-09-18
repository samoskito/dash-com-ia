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
    return this.run("xmax_webhook.rejected", rawBody, () =>
      this.ingestService.ingest({
        accountId,
        token: headerToken ?? token,
        contentType,
        providerAttempt,
        rawBody,
      }),
    );
  }

  /**
   * Global ingress: one URL for the whole XMAX tenant. `:ingressId` is
   * opaque/constant across all queues; `Queue_id` in the body selects the
   * account. Auth is against the ingress, before any routing.
   */
  @Post("ingress/:ingressId")
  @HttpCode(202)
  async receiveGlobal(
    @Param("ingressId") ingressId: string,
    @Query("token") token: unknown,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-attempt") providerAttempt: unknown,
    @Headers("x-wpptrack-webhook-token") headerToken: unknown,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    return this.run("xmax_ingress_webhook.rejected", rawBody, () =>
      this.ingestService.ingestGlobal({
        ingressId,
        token: headerToken ?? token,
        contentType,
        providerAttempt,
        rawBody,
      }),
    );
  }

  private async run<T>(
    rejectedEvent: string,
    rawBody: Buffer | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          JSON.stringify({
            event: rejectedEvent,
            durationMs: Date.now() - startedAt,
            bodyBytes: rawBody?.length ?? 0,
          }),
        );
      }
      throw error;
    }
  }
}
