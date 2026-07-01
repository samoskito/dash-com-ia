import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("API health", () => {
  it("returns service health", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

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
});
