import type { NestExpressApplication } from "@nestjs/platform-express";
import { INBOUND_WEBHOOK_BODY_LIMIT } from "./inbound-webhook-limits";

const { raw } = require("body-parser") as {
  raw: (...arguments_: unknown[]) => any;
};

type RequestWithRawBody = {
  rawBody?: Buffer;
};

function captureRawBody(
  request: RequestWithRawBody,
  _response: unknown,
  buffer: Buffer,
): void {
  request.rawBody = Buffer.from(buffer);
}

/**
 * Installs the inbound webhook parser before the application JSON parser.
 *
 * Inbound providers sometimes send a JSON string as the root value. Keeping
 * this route raw lets ingestion return its stable validation response instead
 * of body-parser rejecting it before the controller can run.
 */
export function configureInboundWebhookBodyParser(
  app: NestExpressApplication,
): void {
  app.use(
    "/webhooks/inbound",
    raw({
      type: "application/json",
      limit: INBOUND_WEBHOOK_BODY_LIMIT,
      verify: captureRawBody,
    }),
  );
  app.useBodyParser("json", {
    limit: INBOUND_WEBHOOK_BODY_LIMIT,
    strict: false,
  } as { limit: string });
}
