import { describe, expect, it, vi } from "vitest";
import { GuimoAdapter } from "../src/guimo/guimo.adapter";
import { matchesGuimoStage, normalizeGuimoStageName, parseGuimoV1StageMovement } from "../src/guimo/guimo-webhook.parser";
import { parseGuimoConfiguration } from "../src/guimo/guimo.schema";
import { hashNormalizedPhone, normalizePhoneIdentityWithCountry } from "../src/common/phone/phone-identity";

describe("Guimo v1 contract boundary", () => {
  const payload = { id_negociacao: 9, id_contato: 8, estagio_anterior: { id: 1, nome: "Novo" }, estagio_novo: { id: 2, nome: " Lead Qualificado " } };
  it("parses only the observed movement fields and rejects missing required data", () => {
    expect(parseGuimoV1StageMovement(payload)).toEqual({ negotiationId: "9", contactId: "8", previousStage: { id: "1", name: "Novo" }, newStage: { id: "2", name: "Lead Qualificado" } });
    expect(parseGuimoV1StageMovement({ id_contato: 8 })).toBeNull();
  });
  it("matches configured IDs first, otherwise exact normalized names, never re-entry", () => {
    expect(matchesGuimoStage({ id: "2", name: "other" }, { id: "2", name: "anything" }, { id: "1", name: "Novo" })).toBe(true);
    expect(matchesGuimoStage({ name: "lead QUALIFICADO" }, { id: "2", name: " Lead   Qualificado " }, { id: "1", name: "Novo" })).toBe(true);
    expect(matchesGuimoStage({ name: "Lead Qualificado" }, { id: "2", name: "Lead Qualificado" }, { id: "1", name: "Lead Qualificado" })).toBe(false);
    expect(normalizeGuimoStageName(" LEAD  QUALIFICADO ")).toBe("lead qualificado");
  });
  it("validates configuration without accepting arbitrary credential shapes", () => {
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { Authorization: "[REDACTED]" } })).toMatchObject({ qualifiedStageId: "2" });
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { ["Authorization"]: 1 + 2 } })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: {} })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { Authorization: "   " } })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { "X-Unknown-Credential": "[REDACTED]" } })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { accept: "text/plain" } })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", crmHeaders: { Authorization: "[REDACTED]", authorization: "[REDACTED]" } })).toBeNull();
    expect(parseGuimoConfiguration({ qualifiedStageId: "2", purchaseValueUnit: "dollars" })).toBeNull();
  });
  it("reads the observed contact envelope and does not expose response extras", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://integracao.agendasistemacrm.com.br/api/v1/chat/contato/8");
      return { ok: true, json: async () => ({ status: "success", data: [{ contato: { telefone: "0000000000000@s.whatsapp.net", remoteJidAlt: "0000000000000@s.whatsapp.net", instanceToken: "[REDACTED]" }, chat: { pushName: "Nome", messages: ["[REDACTED]"] }, providerUrl: "[REDACTED]" }], meta: { total: 1 } }) } as Response;
    });
    await expect(new GuimoAdapter().getContact("8", { Authorization: "[REDACTED]" }, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ name: "Nome", phone: "0000000000000@s.whatsapp.net" });
  });
  it("reads only the negotiation value from the observed envelope", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success", data: [{ valor: "123,45", id_contato: "[REDACTED]", providerToken: "[REDACTED]" }], meta: { total: 1 } }) } as Response));
    await expect(new GuimoAdapter().getNegotiation("9", {}, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ value: 123.45 });
  });
  it("preserves zero purchase value for the non-positive business-rule check", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success", data: [{ valor: 0 }], meta: { total: 1 } }) } as Response));
    await expect(new GuimoAdapter().getNegotiation("9", {}, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ value: 0 });
  });
  it.each([
    { status: "error", data: [{ contato: {} }] },
    { status: "success", data: [] },
    { status: "success", data: [{}] },
    { status: "success", data: "not-an-array" },
  ])("rejects malformed or empty CRM envelopes", async (response) => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => response }) as Response);
    await expect(new GuimoAdapter().getContact("8", {}, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ code: "guimo_invalid_response" });
  });
  it("normalizes a WhatsApp JID before the workspace-scoped lead lookup", () => {
    const phone = normalizePhoneIdentityWithCountry("5511999999999@s.whatsapp.net");
    expect(phone).toBe("5511999999999");
    expect(hashNormalizedPhone(phone)).toMatch(/^[a-f0-9]{64}$/);
  });
});
