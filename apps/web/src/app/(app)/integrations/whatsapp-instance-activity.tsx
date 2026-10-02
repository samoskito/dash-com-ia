import {
  whatsappInstanceActivitySchema,
  type WhatsappInstanceActivityDto,
} from "@wpptrack/shared";
import Link from "next/link";
import { displayTimeZone } from "../../../lib/date-time";

/**
 * Activity of one UAZAPI instance as the page fetched it. `checkedAt` is the
 * server time of the read, so the 24h webhook cutoff renders the same on the
 * server and in the browser.
 */
export type WhatsappInstanceActivityView =
  | {
      state: "real";
      activity: WhatsappInstanceActivityDto;
      checkedAt: string;
    }
  | { state: "unavailable" };

export type WhatsappInstanceActivities = Record<
  string,
  WhatsappInstanceActivityView
>;

export type WebhookRecency = "recent" | "stale" | "none" | "unavailable";

export const webhookStaleAfterMs = 24 * 60 * 60 * 1000;

/** Anything off-contract is unavailable, never a zero. */
export function whatsappInstanceActivityView(
  payload: unknown,
  checkedAt: Date,
): WhatsappInstanceActivityView {
  const parsed = whatsappInstanceActivitySchema.safeParse(payload);

  return parsed.success
    ? {
        state: "real",
        activity: parsed.data,
        checkedAt: checkedAt.toISOString(),
      }
    : { state: "unavailable" };
}

/** Stale only when the last webhook is strictly older than 24h. */
export function webhookRecency(
  view: WhatsappInstanceActivityView | undefined,
): WebhookRecency {
  if (!view || view.state !== "real") {
    return "unavailable";
  }

  const { lastWebhookAt } = view.activity;

  if (!lastWebhookAt) {
    return "none";
  }

  const age = Date.parse(view.checkedAt) - Date.parse(lastWebhookAt);

  return age > webhookStaleAfterMs ? "stale" : "recent";
}

export function webhookRecencyLabel(recency: WebhookRecency): string {
  const labels: Record<WebhookRecency, string> = {
    recent: "Webhook recebido nas ultimas 24h",
    stale: "Sem webhook recente ha mais de 24h",
    none: "Nenhum webhook registrado",
    unavailable: "Atividade indisponivel",
  };

  return labels[recency];
}

/** Current lead-instance association; no period is implied. */
export function instanceLeadsHref(whatsappInstanceId: string): string {
  return `/leads?${new URLSearchParams({ whatsappInstanceId }).toString()}`;
}

function activityDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: displayTimeZone,
  });
}

export function WhatsappInstanceActivitySummary({
  view,
  whatsappInstanceId,
}: {
  view: WhatsappInstanceActivityView | undefined;
  whatsappInstanceId: string;
}) {
  const recency = webhookRecency(view);
  const activity = view?.state === "real" ? view.activity : null;

  return (
    <div
      className="whatsapp-instance-activity"
      data-activity-state={activity ? "real" : "unavailable"}
    >
      {activity ? (
        <dl
          className="whatsapp-instance-activity-counts"
          aria-label="Leads de anuncio (CTWA) desta instancia"
        >
          <div>
            <dt>CTWA 24h</dt>
            <dd>{activity.leads24h}</dd>
          </div>
          <div>
            <dt>CTWA 7 dias</dt>
            <dd>{activity.leads7d}</dd>
          </div>
          <div>
            <dt>CTWA total</dt>
            <dd>{activity.leadsTotal}</dd>
          </div>
          <div>
            <dt>Ultimo lead</dt>
            <dd>
              {activity.lastLeadAt
                ? activityDateTime(activity.lastLeadAt)
                : "Nenhum lead registrado"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted">
          Atividade indisponivel. Os contadores nao foram carregados.
        </p>
      )}
      <span
        className={`event-chip${
          recency === "stale" || recency === "none" ? " warn" : ""
        }`}
      >
        {webhookRecencyLabel(recency)}
      </span>
      {activity?.lastWebhookAt ? (
        <small>
          Ultimo webhook: {activityDateTime(activity.lastWebhookAt)}
        </small>
      ) : null}
      <Link
        className="button ghost"
        href={instanceLeadsHref(whatsappInstanceId)}
      >
        Ver leads desta instancia
      </Link>
    </div>
  );
}
