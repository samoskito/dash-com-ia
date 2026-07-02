import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsPage from "../src/app/(app)/settings/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings route", () => {
  it("renders conversion rules returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "rule_1",
            workspaceId: "workspace_1",
            name: "Lead qualificado por palavra",
            triggerType: "keyword",
            triggerValue: "quero comprar",
            matchMode: "contains",
            eventName: "QualifiedLead",
            pixelId: null,
            active: true,
            createdAt: "2026-07-02T03:00:00.000Z",
            updatedAt: "2026-07-02T03:00:00.000Z"
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/conversion-rules",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Lead qualificado por palavra");
    expect(html).toContain("Palavra-chave");
    expect(html).toContain("quero comprar");
    expect(html).toContain("QualifiedLead");
    expect(html).toContain("Nova regra de conversao");
    expect(html).toContain("Criar regra");
    expect(html).toContain("Nome da regra");
    expect(html).toContain("Etiqueta WhatsApp");
    expect(html).toContain("Pausar");
  });
});
