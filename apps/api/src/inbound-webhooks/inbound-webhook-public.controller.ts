import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  RawBody,
} from "@nestjs/common";
import { InboundWebhookIngestionService } from "./inbound-webhook-ingestion.service";

@Controller("webhooks/inbound")
export class InboundWebhookPublicController {
  constructor(
    @Inject(InboundWebhookIngestionService)
    private readonly ingestion: InboundWebhookIngestionService,
  ) {}

  @Post(":connectionId")
  @HttpCode(202)
  async receive(
    @Param("connectionId") connectionId: string,
    @Query("token") token: unknown,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-attempt") providerAttempt: unknown,
    @RawBody() rawBody: Buffer | undefined,
  ) {
    return this.ingestion.ingest({
      connectionId,
      token,
      contentType,
      providerAttempt,
      rawBody,
    });
  }
}
