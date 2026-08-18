import { createHash } from "node:crypto";
import { z } from "zod";

const boundedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

/**
 * XMAX webhook body (contact edit). Tags in the webhook are always empty —
 * real tags come from getContact. We still accept optional Tags and ignore them
 * for event decisions.
 */
export const xmaxContactWebhookSchema = z
  .object({
    Contact_Id: z.union([z.string(), z.number()]).optional(),
    contact_id: z.union([z.string(), z.number()]).optional(),
    contactId: z.union([z.string(), z.number()]).optional(),
    Id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    Telefone: z.union([z.string(), z.number()]).optional(),
    telefone: z.union([z.string(), z.number()]).optional(),
    phone: z.union([z.string(), z.number()]).optional(),
    Phone: z.union([z.string(), z.number()]).optional(),
    Nome: z.string().optional(),
    nome: z.string().optional(),
    name: z.string().optional(),
    Name: z.string().optional(),
    Tags: z.unknown().optional(),
    tags: z.unknown().optional(),
  })
  .passthrough();

export type ParsedXmaxContactWebhook = {
  contactId: string;
  phoneHint?: string;
  name?: string;
  /** Always ignored for decisions; kept for diagnostics only. */
  webhookTagIds: string[];
  ingressKey: string;
};

function asId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 128);
  }
  return undefined;
}

function asPhone(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 40);
  }
  return undefined;
}

function asName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 200);
  }
  return undefined;
}

/** Extract string tag ids from heterogeneous XMAX tag payloads. */
export function extractXmaxTagIds(raw: unknown): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    const ids: string[] = [];
    for (const item of raw) {
      if (typeof item === "string" || typeof item === "number") {
        const id = asId(item);
        if (id) ids.push(id);
        continue;
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const id =
          asId(record.id) ??
          asId(record.Id) ??
          asId(record.tagId) ??
          asId(record.TagId) ??
          asId(record.Tag_Id);
        if (id) ids.push(id);
      }
    }
    return [...new Set(ids)];
  }
  return [];
}

export function parseXmaxContactWebhook(
  body: unknown,
  rawBody?: Buffer,
):
  | { ok: true; value: ParsedXmaxContactWebhook }
  | { ok: false; reason: string } {
  const parsed = xmaxContactWebhookSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return { ok: false, reason: "invalid_payload" };
  }

  const data = parsed.data;
  const contactId =
    asId(data.Contact_Id) ??
    asId(data.contact_id) ??
    asId(data.contactId) ??
    asId(data.Id) ??
    asId(data.id);

  if (!contactId) {
    return { ok: false, reason: "missing_contact_id" };
  }

  const phoneHint =
    asPhone(data.Telefone) ??
    asPhone(data.telefone) ??
    asPhone(data.phone) ??
    asPhone(data.Phone);

  const name =
    asName(data.Nome) ??
    asName(data.nome) ??
    asName(data.name) ??
    asName(data.Name);

  const ingressKey = rawBody?.length
    ? createHash("sha256").update(rawBody).digest("hex")
    : createHash("sha256")
        .update(JSON.stringify({ contactId, phoneHint, name }))
        .digest("hex");

  return {
    ok: true,
    value: {
      contactId,
      phoneHint,
      name,
      webhookTagIds: extractXmaxTagIds(data.Tags ?? data.tags),
      ingressKey,
    },
  };
}

export const XMAX_CONTACT_PARSER_VERSION = "xmax-contact-v1";
