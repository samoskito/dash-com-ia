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
          status: "qr_required",
          qrcode: "qr-code-text"
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
      "https://uazapi.test/instance/qr/provider_instance_1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token"
        })
      })
    );
    expect(status.connectionStatus).toBe("qr_required");
    expect(status.qrCode).toBe("qr-code-text");
  });
});
