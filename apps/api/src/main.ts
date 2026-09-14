import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { parseDeploymentConfig } from "./config/deployment-config";
import { getApiPort } from "./config/env";
import { loadLocalEnv } from "./config/load-env";
import { INBOUND_WEBHOOK_BODY_LIMIT } from "./inbound-webhooks/inbound-webhook-limits";

async function bootstrap() {
  loadLocalEnv();
  const deploymentConfig = parseDeploymentConfig();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Data Crazy may POST a top-level JSON *string* (double-encoded object).
  // Express/Nest default strict JSON parsing rejects that before our controller
  // with a framework 400 ("Unexpected token ... is not valid JSON"), so the
  // delivery never reaches observation. Allow non-object JSON roots here and
  // let inbound ingestion unwrap/validate the payload.
  app.useBodyParser("json", {
    limit: INBOUND_WEBHOOK_BODY_LIMIT,
    strict: false,
  } as { limit: string });
  app.enableCors({
    origin: deploymentConfig.webOrigin,
    credentials: true,
  });

  await app.listen(getApiPort());
}

void bootstrap();
