import { Logger } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestDurationInterceptor } from "../src/common/http/request-duration.interceptor";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WPPTRACK_API_SLOW_REQUEST_MS;
});

describe("request duration interceptor", () => {
  it("logs slow HTTP routes with method, path and duration", async () => {
    process.env.WPPTRACK_API_SLOW_REQUEST_MS = "0";
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const interceptor = new RequestDurationInterceptor();
    const context = {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => ({
          method: "GET",
          originalUrl: "/reports/campaigns?page=1",
        }),
      }),
    };

    await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => of({ ok: true }),
      }),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"http.request.slow"'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"method":"GET"'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"path":"/reports/campaigns?page=1"'),
    );
  });
});
