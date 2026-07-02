import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WebhookPayloadPage from "../src/app/(backoffice)/backoffice/webhooks/[webhookId]/payload/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhook payload route", () => {
  it("renders sanitized webhook payload returned by diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "webhook_1",
          workspaceId: "workspace_1",
          source: "uazapi",
          eventType: "message.received",
          externalEventId: "evt_1",
          status: "received",
          receivedAt: "2026-07-02T03:00:00.000Z",
          payloadKind: "summary",
          payloadAvailable: true,
          payload: {
            message: {
              text: "Venda fechada"
            },
            authorization: "[redacted]"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await WebhookPayloadPage({
      params: Promise.resolve({ webhookId: "webhook_1" })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/webhooks/webhook_1/payload",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Payload do webhook");
    expect(html).toContain("message.received");
    expect(html).toContain("Venda fechada");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("secret-token");
  });
});
