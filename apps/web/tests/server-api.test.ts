import { afterEach, describe, expect, it, vi } from "vitest";
import { serverApiFetch } from "../src/lib/server-api";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    toString: (): string => "wpptrack_session=refresh-token",
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server api client", () => {
  it("forwards the Next.js cookie header to the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await serverApiFetch<{ ok: true }>(
      "/backoffice/diagnostics/events",
    );

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/events",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Cookie: "wpptrack_session=refresh-token",
        }),
      }),
    );
  });

  it("accepts successful responses without a JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(
      serverApiFetch<void>("/integrations/inbound-webhooks/connection_1", {
        method: "DELETE",
      }),
    ).resolves.toBeUndefined();
  });
});
