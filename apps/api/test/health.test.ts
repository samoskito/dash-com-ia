import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

const readyPayload = {
  status: "ok",
  service: "wpptrack-api",
  dependencies: {
    database: "ok",
    redis: "ok"
  }
};

async function createAppWithHealth(healthService: {
  getLiveness: () => { status: string; service: string };
  getReadiness: () => Promise<Record<string, unknown>>;
}) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      {
        provide: HealthService,
        useValue: healthService
      }
    ]
  })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return app;
}

describe("API health", () => {
  it("returns service health", async () => {
    const app = await createAppWithHealth({
        getLiveness: () => ({
          status: "ok",
          service: "wpptrack-api"
        }),
        getReadiness: async () => readyPayload
      });

    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          status: "ok",
          service: "wpptrack-api"
        });
      });

    await app.close();
  });

  it("returns readiness when database and redis are available", async () => {
    const app = await createAppWithHealth({
        getLiveness: () => ({
          status: "ok",
          service: "wpptrack-api"
        }),
        getReadiness: async () => readyPayload
      });

    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(readyPayload);
      });

    await app.close();
  });

  it("returns service unavailable when readiness dependency checks fail", async () => {
    const app = await createAppWithHealth({
        getLiveness: () => ({
          status: "ok",
          service: "wpptrack-api"
        }),
        getReadiness: async () => ({
          status: "degraded",
          service: "wpptrack-api",
          dependencies: {
            database: "ok",
            redis: "error"
          }
        })
      });

    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(503)
      .expect(({ body }) => {
        expect(body.status).toBe("degraded");
        expect(body.dependencies.redis).toBe("error");
      });

    await app.close();
  });
});
