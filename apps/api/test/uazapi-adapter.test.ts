import { describe, expect, it, vi } from "vitest";
import { UazapiAdapter } from "../src/integrations/uazapi/uazapi.adapter";

describe("uazapi adapter", () => {
  it("reports not_configured without calling the external API when env is missing", async () => {
    const fetch = vi.fn();
    const adapter = new UazapiAdapter({}, fetch);

    const status = await adapter.getInstanceStatus("wpp_1");

    expect(fetch).not.toHaveBeenCalled();
    expect(status.connectionStatus).toBe("not_configured");
    expect(status.qrCode).toBeNull();
  });

  it("uses server-side token when requesting QR status", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          instance: {
            id: "provider_instance_1",
            status: "connecting",
            qrcode: "qr-code-text"
          },
          status: {
            connected: false,
            loggedIn: false
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const adapter = new UazapiAdapter(
      {
        UAZAPI_BASE_URL: "https://uazapi.test",
        UAZAPI_TOKEN: "secret-token"
      },
      fetch
    );

    const status = await adapter.getQr("provider_instance_1");

    expect(fetch).toHaveBeenCalledWith(
      "https://uazapi.test/instance/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          token: "secret-token"
        })
      })
    );
    expect(status.connectionStatus).toBe("qr_required");
    expect(status.qrCode).toBe("qr-code-text");
  });

  it("connects an instance through the official Uazapi endpoint", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          instance: {
            id: "provider_instance_1",
            status: "connected"
          },
          status: {
            connected: true,
            loggedIn: true
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const adapter = new UazapiAdapter(
      {
        UAZAPI_BASE_URL: "https://uazapi.test/",
        UAZAPI_TOKEN: "secret-token"
      },
      fetch
    );

    const status = await adapter.connectInstance("provider_instance_1");

    expect(fetch).toHaveBeenCalledWith(
      "https://uazapi.test/instance/connect",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          token: "secret-token"
        })
      })
    );
    expect(status.providerInstanceId).toBe("provider_instance_1");
    expect(status.connectionStatus).toBe("connected");
  });

  it("lists WhatsApp labels through the official Uazapi endpoint", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: "label_uuid_1",
            name: "Venda fechada",
            colorHex: "#fed428",
            labelid: "10",
            owner: "secret-owner"
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const adapter = new UazapiAdapter(
      {
        UAZAPI_BASE_URL: "https://uazapi.test",
        UAZAPI_TOKEN: "secret-token"
      },
      fetch
    );

    const result = await adapter.listLabels("provider_instance_1");

    expect(fetch).toHaveBeenCalledWith(
      "https://uazapi.test/labels",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          token: "secret-token"
        })
      })
    );
    expect(result).toEqual({
      status: "success",
      message: null,
      labels: [
        {
          id: "label_uuid_1",
          name: "Venda fechada",
          colorHex: "#fed428",
          labelId: "10"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("secret-owner");
  });
});
