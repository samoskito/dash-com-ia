import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseDeploymentConfig } from "./config/deployment-config";
import { getApiPort } from "./config/env";
import { loadLocalEnv } from "./config/load-env";

async function bootstrap() {
  loadLocalEnv();
  const deploymentConfig = parseDeploymentConfig();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: deploymentConfig.webOrigin,
    credentials: true
  });

  await app.listen(getApiPort());
}

void bootstrap();
