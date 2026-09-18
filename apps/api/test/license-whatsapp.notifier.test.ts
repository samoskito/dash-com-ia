import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicenseWhatsappNotifier } from "../src/licensing/license-whatsapp.notifier";

function configuredEnv() {
  return {
    LICENSE_NOTIFY_UAZAPI_BASE_URL: "https://uazapi.example.com",
    LICENSE_NOTIFY_UAZAPI_TOKEN: "token-123",
  };
}

describe("LicenseWhatsappNotifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports not_configured and skips the request when base URL/token are missing", async () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const notifier = new LicenseWhatsappNotifier({});

    const sent = await notifier.sendLicenseKey("+5542998289255", "hello");

    expect(sent).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=not_configured"),
    );
  });

  it("reports empty_phone when the phone has no digits", async () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const notifier = new LicenseWhatsappNotifier(configuredEnv());

    const sent = await notifier.sendLicenseKey("not-a-phone", "hello");

    expect(sent).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("reason=empty_phone"));
  });

  it("reports http_not_ok when the provider responds with a non-2xx status", async () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const notifier = new LicenseWhatsappNotifier(configuredEnv());

    const sent = await notifier.sendLicenseKey("+5542998289255", "hello");

    expect(sent).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=http_not_ok status=500"),
    );
  });

  it("reports network on a fetch rejection", async () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const notifier = new LicenseWhatsappNotifier(configuredEnv());

    const sent = await notifier.sendLicenseKey("+5542998289255", "hello");

    expect(sent).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("reason=network"));
  });

  it("sends successfully and normalizes phone digits (55 + 42998289255)", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const notifier = new LicenseWhatsappNotifier(configuredEnv());

    const sent = await notifier.sendLicenseKey("5542998289255", "sua licenca");

    expect(sent).toBe(true);
    const options = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(options.body)).toMatchObject({ number: "5542998289255" });
  });
});
