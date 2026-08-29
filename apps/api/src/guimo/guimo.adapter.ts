import { Injectable } from "@nestjs/common";

export type GuimoAdapterErrorCode = "guimo_timeout" | "guimo_http_error" | "guimo_invalid_response" | "guimo_network_error";
export class GuimoAdapterError extends Error {
  constructor(readonly code: GuimoAdapterErrorCode, message: string, readonly statusCode?: number) { super(message); this.name = "GuimoAdapterError"; }
}
export type GuimoContact = { name?: string; phone?: string };
export type GuimoNegotiation = { value?: number };

/** Only the two observed server-side CRM paths are used. Headers come from encrypted workspace config. */
@Injectable()
export class GuimoAdapter {
  async getContact(contactId: string, headers: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<GuimoContact> {
    const record = this.responseRecord(await this.get(`/api/v1/chat/contato/${encodeURIComponent(contactId)}`, headers, fetchImpl));
    const contact = this.object(record.contato); const chat = this.object(record.chat);
    const phone = this.text(contact.telefone) ?? this.text(contact.remoteJidAlt);
    return { name: this.text(chat.pushName) ?? undefined, phone: phone ?? undefined };
  }
  async getNegotiation(negotiationId: string, headers: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<GuimoNegotiation> {
    const record = this.responseRecord(await this.get(`/api/v1/crm/negociacoes/${encodeURIComponent(negotiationId)}`, headers, fetchImpl)); const raw = record.valor; const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.replace(",", ".")) : NaN;
    return { value: Number.isFinite(value) ? value : undefined };
  }
  private async get(path: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
    const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), 5_000);
    try {
      const response = await fetchImpl(`https://integracao.agendasistemacrm.com.br${path}`, { headers: { ...headers, accept: "application/json" }, signal: timeout.signal });
      if (!response.ok) throw new GuimoAdapterError("guimo_http_error", "Guimo CRM HTTP error", response.status);
      try { return await response.json(); } catch { throw new GuimoAdapterError("guimo_invalid_response", "Guimo CRM invalid JSON"); }
    } catch (error) {
      if (error instanceof GuimoAdapterError) throw error;
      if (error && typeof error === "object" && "name" in error && (error as {name?: string}).name === "AbortError") throw new GuimoAdapterError("guimo_timeout", "Guimo CRM timeout");
      throw new GuimoAdapterError("guimo_network_error", "Guimo CRM network error");
    } finally { clearTimeout(timer); }
  }
  private responseRecord(value: unknown): Record<string, unknown> {
    const root = this.object(value); const data = root.data;
    if (root.status !== "success" || !Array.isArray(data) || data.length === 0) throw new GuimoAdapterError("guimo_invalid_response", "Guimo CRM invalid response");
    const record = this.object(data[0]);
    if (Object.keys(record).length === 0) throw new GuimoAdapterError("guimo_invalid_response", "Guimo CRM invalid response");
    return record;
  }
  private object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
}
