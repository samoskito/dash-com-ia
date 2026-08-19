import { Injectable, Logger } from "@nestjs/common";
import { extractXmaxTagIds } from "./xmax-contact.parser";

export type XmaxGetContactResult = {
  contactId: string;
  number?: string;
  name?: string;
  tagIds: string[];
  raw: unknown;
};

export type XmaxAdapterErrorCode =
  | "xmax_timeout"
  | "xmax_http_error"
  | "xmax_invalid_response"
  | "xmax_network_error";

export class XmaxAdapterError extends Error {
  constructor(
    readonly code: XmaxAdapterErrorCode,
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "XmaxAdapterError";
  }
}

export type XmaxGetContactInput = {
  /** Tenant origin only, e.g. https://tenant.atenderbem.com (no path). */
  baseUrl: string;
  queueId: string;
  apiKey: string;
  contactId: string;
  /** Default 4000ms */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Real XMAX / AtenderBem contract (from production n8n):
 *   POST {baseUrl}/int/getContact
 *   headers: accept: application/json
 *   body: { queueId, apiKey, id }
 *
 * Do NOT use Bearer / GET /api/contacts — that path is not what the tenant uses.
 */
@Injectable()
export class XmaxAdapter {
  private readonly logger = new Logger(XmaxAdapter.name);

  async getContact(input: XmaxGetContactInput): Promise<XmaxGetContactResult> {
    const timeoutMs = input.timeoutMs ?? 4_000;
    const base = input.baseUrl.replace(/\/+$/, "");
    const url = `${base}/int/getContact`;
    const fetchFn = input.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          queueId: input.queueId,
          apiKey: input.apiKey,
          id: input.contactId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new XmaxAdapterError(
          "xmax_http_error",
          "XMAX getContact HTTP error",
          response.status,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new XmaxAdapterError(
          "xmax_invalid_response",
          "XMAX getContact invalid JSON",
        );
      }

      return this.parseContactResponse(body, input.contactId);
    } catch (error) {
      if (error instanceof XmaxAdapterError) {
        throw error;
      }
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
      ) {
        throw new XmaxAdapterError("xmax_timeout", "XMAX getContact timeout");
      }
      this.logger.warn("xmax_get_contact_failed");
      throw new XmaxAdapterError(
        "xmax_network_error",
        "XMAX getContact network error",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseContactResponse(
    body: unknown,
    fallbackContactId: string,
  ): XmaxGetContactResult {
    const root =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const data =
      root.data && typeof root.data === "object" && !Array.isArray(root.data)
        ? (root.data as Record<string, unknown>)
        : root;

    const contactId =
      this.asString(data.id) ??
      this.asString(data.Id) ??
      this.asString(data.Contact_Id) ??
      this.asString(data.contactId) ??
      fallbackContactId;

    const number =
      this.asString(data.number) ??
      this.asString(data.Number) ??
      this.asString(data.phone) ??
      this.asString(data.Phone) ??
      this.asString(data.Telefone) ??
      this.asString(data.telefone);

    const name =
      this.asString(data.name) ??
      this.asString(data.Name) ??
      this.asString(data.Nome) ??
      this.asString(data.nome);

    const tagIds = extractXmaxTagIds(
      data.tags ?? data.Tags ?? data.tagIds ?? data.TagIds,
    );

    return {
      contactId,
      number: number ?? undefined,
      name: name ?? undefined,
      tagIds,
      raw: body,
    };
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return undefined;
  }
}
