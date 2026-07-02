import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { integrationHealthSchema } from "../../../packages/shared/src/schemas/integrations";
import { AsaasAdapter } from "../src/integrations/asaas/asaas.adapter";
import {
  INTEGRATION_ENV,
  IntegrationsModule
} from "../src/integrations/integrations.module";
import { MetaAdapter } from "../src/integrations/meta/meta.adapter";
import { UazapiAdapter } from "../src/integrations/uazapi/uazapi.adapter";

describe("integration adapters", () => {
  it("reports disconnected health when required env vars are missing", async () => {
    const adapters = [
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({})
    ];

    for (const adapter of adapters) {
      const health = await adapter.getHealth();

      expect(health.provider).toBe(adapter.provider);
      expect(health.status).toBe("disconnected");
      expect(integrationHealthSchema.parse(health)).toEqual(health);
    }
  });

  it("reports connected health when required env vars are present", async () => {
    const adapters = [
      new MetaAdapter({
        META_APP_ID: "app-id",
        META_APP_SECRET: "app-secret"
      }),
      new UazapiAdapter({
        UAZAPI_BASE_URL: "https://uazapi.example.com",
        UAZAPI_TOKEN: "token"
      }),
      new AsaasAdapter({
        ASAAS_BASE_URL: "https://asaas.example.com",
        ASAAS_API_KEY: "api-key"
      })
    ];

    for (const adapter of adapters) {
      const health = await adapter.getHealth();

      expect(health.provider).toBe(adapter.provider);
      expect(health.status).toBe("connected");
      expect(integrationHealthSchema.parse(health)).toEqual(health);
    }
  });

  it("compiles the Nest module and resolves exported adapters", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IntegrationsModule]
    }).compile();

    expect(moduleRef.get(MetaAdapter).provider).toBe("meta");
    expect(moduleRef.get(UazapiAdapter).provider).toBe("uazapi");
    expect(moduleRef.get(AsaasAdapter).provider).toBe("asaas");

    await moduleRef.close();
  });

  it("injects env through the Nest module provider token", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IntegrationsModule]
    })
      .overrideProvider(INTEGRATION_ENV)
      .useValue({
        META_APP_ID: "app-id",
        META_APP_SECRET: "app-secret",
        UAZAPI_BASE_URL: "https://uazapi.example.com",
        UAZAPI_TOKEN: "token",
        ASAAS_BASE_URL: "https://asaas.example.com",
        ASAAS_API_KEY: "api-key"
      })
      .compile();

    await expect(moduleRef.get(MetaAdapter).getHealth()).resolves.toMatchObject({
      provider: "meta",
      status: "connected"
    });
    await expect(moduleRef.get(UazapiAdapter).getHealth()).resolves.toMatchObject({
      provider: "uazapi",
      status: "connected"
    });
    await expect(moduleRef.get(AsaasAdapter).getHealth()).resolves.toMatchObject({
      provider: "asaas",
      status: "connected"
    });

    await moduleRef.close();
  });
});
