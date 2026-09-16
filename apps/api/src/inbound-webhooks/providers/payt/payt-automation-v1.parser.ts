import { normalizePhoneIdentity } from "../../../common/phone/phone-identity";
import { boundedString } from "../inbound-webhook-delivery-identity";

export const PAYT_AUTOMATION_V1_PARSER_VERSION = "automation-v1";

export type ParsedPaytAutomationV1 = {
  provider: "payt";
  automation: "purchase_paid";
  eventName: "Purchase";
  phone: string;
  phoneCandidates: string[];
  occurredAt: Date;
  externalExecutionKey: string;
  valueCents: number;
  currency: "BRL";
  test: boolean;
};

export type PaytAutomationV1ParseResult =
  | { ok: true; value: ParsedPaytAutomationV1 }
  | {
      ok: false;
      errorCode:
        | "payt_automation_v1_not_purchase"
        | "payt_automation_v1_invalid_payload";
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrap(payload: unknown): Record<string, unknown> | null {
  const direct = asRecord(payload);
  if (direct) return direct;

  // n8n's webhook test/export envelope is an array with the original body.
  if (!Array.isArray(payload) || payload.length !== 1) return null;
  const envelope = asRecord(payload[0]);
  return envelope ? asRecord(envelope.body) : null;
}

function parseTimestamp(value: unknown): Date | null {
  const timestamp = boundedString(value, 80);
  if (!timestamp) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(
    timestamp,
  )
    ? `${timestamp.replace(" ", "T")}Z`
    : timestamp;
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

export function paytPhoneCandidates(phone: unknown): string[] {
  const received = normalizePhoneIdentity(
    typeof phone === "string" ? phone : undefined,
  );
  if (!received) return [];

  // Payt commonly sends a national BR number. Preserve it as received first,
  // then also try its E.164 equivalent without assuming a value for other forms.
  const prefixed =
    (received.length === 10 || received.length === 11) &&
    !received.startsWith("55")
      ? `55${received}`
      : null;
  return prefixed ? [received, prefixed] : [received];
}

export function parsePaytAutomationV1(
  payload: unknown,
): PaytAutomationV1ParseResult {
  try {
    const order = unwrap(payload);
    const transaction = order ? asRecord(order.transaction) : null;
    const customer = order ? asRecord(order.customer) : null;
    const status = order
      ? boundedString(order.status, 40)?.toLocaleLowerCase("en-US")
      : null;
    const type = order
      ? boundedString(order.type, 80)?.toLocaleLowerCase("en-US")
      : null;
    const paymentStatus = transaction
      ? boundedString(transaction.payment_status, 40)?.toLocaleLowerCase(
          "en-US",
        )
      : null;
    const hasPaymentStatus =
      transaction !== null &&
      Object.prototype.hasOwnProperty.call(transaction, "payment_status");
    const isPaidPurchase =
      status === "paid" && (!hasPaymentStatus || paymentStatus === "paid");
    const isCodConfirmedPurchase =
      type === "cash_on_delivery" && status === "order_confirmed";
    if (!isPaidPurchase && !isCodConfirmedPurchase) {
      return { ok: false, errorCode: "payt_automation_v1_not_purchase" };
    }

    const transactionId = order ? boundedString(order.transaction_id, 255) : null;
    const phoneCandidates = paytPhoneCandidates(customer?.phone);
    const valueCents = transaction?.total_price;
    const occurredAt = parseTimestamp(
      transaction?.paid_at ??
        transaction?.updated_at ??
        order?.updated_at ??
        order?.started_at,
    );
    if (
      !transactionId ||
      phoneCandidates.length === 0 ||
      typeof valueCents !== "number" ||
      !Number.isSafeInteger(valueCents) ||
      valueCents <= 0 ||
      !occurredAt
    ) {
      return { ok: false, errorCode: "payt_automation_v1_invalid_payload" };
    }

    return {
      ok: true,
      value: {
        provider: "payt",
        automation: "purchase_paid",
        eventName: "Purchase",
        phone: phoneCandidates[0]!,
        phoneCandidates,
        occurredAt,
        externalExecutionKey: transactionId,
        valueCents,
        currency: "BRL",
        test: order?.test === true,
      },
    };
  } catch {
    return { ok: false, errorCode: "payt_automation_v1_invalid_payload" };
  }
}
