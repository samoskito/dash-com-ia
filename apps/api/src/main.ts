import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { getApiPort } from "./config/env";
import { loadLocalEnv } from "./config/load-env";

async function bootstrap() {
  loadLocalEnv();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  });

  await app.listen(getApiPort());
}

void bootstrap();
