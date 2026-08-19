import { describe, expect, it, vi } from "vitest";
import { XmaxAdapter, XmaxAdapterError } from "../src/xmax/xmax.adapter";

describe("xmax adapter getContact", () => {
  it("POSTs to /int/getContact with queueId, apiKey and id in the body", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://tenant.atenderbem.com/int/getContact");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        "content-type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        queueId: "10",
        apiKey: "secret-key",
        id: "contact_99",
      });
      return {
        ok: true,
        json: async () => ({
          id: "contact_99",
          number: "11988441020",
          name: "Lead X",
          tags: [{ Id: 55 }, { Id: 56 }],
        }),
      } as Response;
    });

    const adapter = new XmaxAdapter();
    const result = await adapter.getContact({
      baseUrl: "https://tenant.atenderbem.com/",
      queueId: "10",
      apiKey: "secret-key",
      contactId: "contact_99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      contactId: "contact_99",
      number: "11988441020",
      name: "Lead X",
      tagIds: ["55", "56"],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps HTTP failures to xmax_http_error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));

    const adapter = new XmaxAdapter();
    await expect(
      adapter.getContact({
        baseUrl: "https://tenant.atenderbem.com",
        queueId: "10",
        apiKey: "bad",
        contactId: "c1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "XmaxAdapterError",
      code: "xmax_http_error",
      statusCode: 401,
    } satisfies Partial<XmaxAdapterError>);
  });

  it("maps abort/timeout to xmax_timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    const adapter = new XmaxAdapter();
    await expect(
      adapter.getContact({
        baseUrl: "https://tenant.atenderbem.com",
        queueId: "10",
        apiKey: "k",
        contactId: "c1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "xmax_timeout" });
  });
});
