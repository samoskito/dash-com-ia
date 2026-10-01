"use client";

import type {
  MetaAssetsDto,
  WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { usePresentationMode } from "../../../components/presentation-mode-toggle";
import { instanceLabel } from "../overview/overview-labels";
import {
  ReportHiddenFields,
  comparisonRangeStatus,
  reportFiltersHref,
  useReportFilters,
  type ReportFilterKey,
} from "./report-filter-state";

type MetaReportFiltersProps = {
  assets: MetaAssetsDto | null;
  whatsappInstances: WhatsappInstanceSummaryDto[];
};

/** Fields this form renders itself; the rest travel as hidden inputs. */
const renderedFilterKeys: readonly ReportFilterKey[] = [
  "businessId",
  "adAccountId",
  "whatsappInstanceId",
  "nameContains",
  "nameScope",
  "status",
  "delivery",
  "whatsappClassification",
  "compareSince",
  "compareUntil",
  "pageSize",
];

/** Presentation mode masks these selects, so their values go hidden. */
const maskedFilterKeys: readonly ReportFilterKey[] = [
  "businessId",
  "adAccountId",
  "whatsappInstanceId",
];

const defaultPageSize = "10";

const nameScopeOptions = [
  ["campaign", "Campanha contem"],
  ["adset", "Conjunto contem"],
  ["ad", "Anuncio contem"],
] as const;

const statusOptions = [
  ["all", "Todos os status"],
  ["active", "Ativas"],
  ["paused", "Pausadas"],
] as const;

const deliveryOptions = [
  ["all", "Com ou sem veiculacao"],
  ["had_delivery", "Teve veiculacao no periodo"],
] as const;

const classificationOptions = [
  ["whatsapp", "Campanhas WhatsApp"],
  ["needs_review", "Precisa revisar"],
  ["excluded", "Excluidas"],
  ["all", "Todas as campanhas"],
] as const;

type ReportingAccount = NonNullable<MetaAssetsDto["reportingAccounts"]>[number];
type ReportingBusiness = {
  id: string;
  name: string;
};

function accountsForBusiness(
  reportingAccounts: ReportingAccount[],
  businessId: string,
) {
  return businessId
    ? reportingAccounts.filter((account) => account.businessId === businessId)
    : reportingAccounts;
}

function validAdAccountId(accounts: ReportingAccount[], adAccountId?: string) {
  return adAccountId &&
    accounts.some((account) => account.adAccountId === adAccountId)
    ? adAccountId
    : "";
}

function businessesFromReportingAccounts(
  reportingAccounts: ReportingAccount[],
): ReportingBusiness[] {
  const businesses = new Map<string, string>();

  reportingAccounts.forEach((account) => {
    if (!businesses.has(account.businessId)) {
      businesses.set(account.businessId, account.businessName);
    }
  });

  return Array.from(businesses, ([id, name]) => ({ id, name }));
}

export function MetaReportFilters({
  assets,
  whatsappInstances,
}: MetaReportFiltersProps) {
  const {
    applied,
    edit,
    fields,
    flush,
    isPending,
    statusMessage,
    submit,
    update,
  } = useReportFilters();
  const compareErrorId = useId();
  const reportingAccounts = useMemo(
    () => (assets?.reportingAccounts ?? []).filter((account) => account.active),
    [assets?.reportingAccounts],
  );
  const presentationMode = usePresentationMode();
  const businesses = useMemo(
    () => businessesFromReportingAccounts(reportingAccounts),
    [reportingAccounts],
  );
  const accounts = useMemo(
    () => accountsForBusiness(reportingAccounts, fields.businessId),
    [reportingAccounts, fields.businessId],
  );
  const selectedAdAccountId = validAdAccountId(accounts, fields.adAccountId);
  const selectedInstanceWasRemoved = Boolean(
    fields.whatsappInstanceId &&
    !whatsappInstances.some(
      (instance) => instance.id === fields.whatsappInstanceId,
    ),
  );
  const compareOrderInvalid =
    comparisonRangeStatus(fields.compareSince, fields.compareUntil) === "order";

  // Limpar keeps the period, the view and the hierarchy drill-down.
  const clearHref = reportFiltersHref({
    ...applied,
    compareSince: "",
    compareUntil: "",
    businessId: "",
    adAccountId: "",
    nameContains: "",
    nameScope: "",
    status: "",
    delivery: "",
    selectedIds: "",
    whatsappClassification: "",
  });

  const nameScope = applied.nameScope || "campaign";
  const status = applied.status || "all";
  const delivery = applied.delivery || "all";
  const whatsappClassification = applied.whatsappClassification || "whatsapp";
  const pageSize = applied.pageSize || defaultPageSize;
  const advancedFilterCount = [
    nameScope !== "campaign",
    status !== "all",
    delivery !== "all",
    whatsappClassification !== "whatsapp",
    Boolean(applied.whatsappInstanceId),
    Boolean(applied.compareSince && applied.compareUntil),
    pageSize !== defaultPageSize,
  ].filter(Boolean).length;
  const hasFilters = Boolean(
    applied.businessId ||
    applied.adAccountId ||
    applied.nameContains ||
    status !== "all" ||
    delivery !== "all" ||
    whatsappClassification !== "whatsapp" ||
    applied.whatsappInstanceId ||
    applied.compareSince ||
    applied.compareUntil ||
    pageSize !== defaultPageSize,
  );
  // Uncontrolled after mount: applying a filter must not fold the panel the
  // user is working in.
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);

  return (
    <form
      className="report-filter-form"
      aria-label="Filtros Meta de relatorios"
      action="/reports"
      onSubmit={submit}
    >
      <ReportHiddenFields
        rendered={
          presentationMode
            ? renderedFilterKeys.filter(
                (key) => !maskedFilterKeys.includes(key),
              )
            : renderedFilterKeys
        }
      />
      <div className="report-filter-primary">
        {presentationMode ? (
          <span className="filter-control presentation-filter-placeholder">
            BM oculto
          </span>
        ) : (
          <select
            className="filter-control"
            name="businessId"
            value={fields.businessId}
            onChange={(event) =>
              update({
                businessId: event.currentTarget.value,
                adAccountId: "",
              })
            }
            aria-label="Filtrar por Business Manager"
          >
            <option value="">Todos os BMs</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        )}
        {presentationMode ? (
          <span className="filter-control presentation-filter-placeholder">
            Conta oculta
          </span>
        ) : (
          <select
            className="filter-control"
            name="adAccountId"
            value={selectedAdAccountId}
            onChange={(event) =>
              update({ adAccountId: event.currentTarget.value })
            }
            aria-label="Filtrar por conta de anuncio"
          >
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.adAccountId}>
                {account.adAccountName}
              </option>
            ))}
          </select>
        )}
        {presentationMode ? (
          <span className="filter-control presentation-filter-placeholder">
            Numero oculto
          </span>
        ) : (
          <select
            className="filter-control"
            name="whatsappInstanceId"
            value={fields.whatsappInstanceId}
            onChange={(event) =>
              update({ whatsappInstanceId: event.currentTarget.value })
            }
            aria-label="Numero WhatsApp"
          >
            <option value="">Todos os numeros</option>
            {selectedInstanceWasRemoved ? (
              <option value={fields.whatsappInstanceId}>Numero removido</option>
            ) : null}
            {whatsappInstances.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {instanceLabel(instance)}
              </option>
            ))}
          </select>
        )}
        <input
          className="filter-control"
          name="nameContains"
          value={fields.nameContains}
          onChange={(event) =>
            edit({ nameContains: event.currentTarget.value })
          }
          onBlur={flush}
          placeholder="Buscar por nome"
          aria-label="Texto contido no nome"
          data-presentation-sensitive-field="true"
        />
        <div
          className="overview-filter-status report-filter-status"
          data-pending={isPending ? "true" : undefined}
        >
          {isPending ? (
            <span className="overview-filter-status-label" aria-hidden="true">
              <span className="overview-filter-spinner" />
              Atualizando...
            </span>
          ) : null}
          <span className="sr-only" role="status" aria-live="polite">
            {isPending ? "Atualizando..." : statusMessage}
          </span>
        </div>

        <details
          className="report-advanced-filters"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary aria-label="Filtros avancados">
            <span>
              <SlidersHorizontal aria-hidden="true" size={15} />
              Avancados
            </span>
            {advancedFilterCount > 0 ? (
              <span className="tag">{advancedFilterCount}</span>
            ) : null}
          </summary>
          <div className="report-filter-advanced-grid">
            <label className="filter-field">
              <span>Buscar em</span>
              <select
                className="filter-control"
                name="nameScope"
                value={fields.nameScope || "campaign"}
                onChange={(event) =>
                  update({ nameScope: event.currentTarget.value })
                }
                aria-label="Tipo de filtro por nome"
              >
                {nameScopeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select
                className="filter-control"
                name="status"
                value={fields.status || "all"}
                onChange={(event) =>
                  update({ status: event.currentTarget.value })
                }
                aria-label="Filtrar por status"
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Veiculacao</span>
              <select
                className="filter-control"
                name="delivery"
                value={fields.delivery || "all"}
                onChange={(event) =>
                  update({ delivery: event.currentTarget.value })
                }
                aria-label="Filtrar por veiculacao no periodo"
              >
                {deliveryOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Canal</span>
              <select
                className="filter-control"
                name="whatsappClassification"
                value={fields.whatsappClassification || "whatsapp"}
                onChange={(event) =>
                  update({ whatsappClassification: event.currentTarget.value })
                }
                aria-label="Filtrar por classificacao WhatsApp"
              >
                {classificationOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Comparar desde</span>
              <input
                className="filter-control"
                type="date"
                name="compareSince"
                value={fields.compareSince}
                onChange={(event) =>
                  edit({ compareSince: event.currentTarget.value })
                }
                onBlur={flush}
              />
            </label>
            <label className="filter-field overview-date-end">
              <span>Comparar ate</span>
              <input
                className="filter-control"
                type="date"
                name="compareUntil"
                value={fields.compareUntil}
                aria-invalid={compareOrderInvalid ? "true" : undefined}
                aria-describedby={
                  compareOrderInvalid ? compareErrorId : undefined
                }
                onChange={(event) =>
                  edit({ compareUntil: event.currentTarget.value })
                }
                onBlur={flush}
              />
              {compareOrderInvalid ? (
                <span className="overview-filter-error" id={compareErrorId}>
                  Fim antes do inicio
                </span>
              ) : null}
            </label>
            <label className="filter-field">
              <span>Itens por pagina</span>
              <select
                className="filter-control"
                name="pageSize"
                value={fields.pageSize || defaultPageSize}
                onChange={(event) =>
                  update({ pageSize: event.currentTarget.value })
                }
              >
                <option value="10">10 itens</option>
                <option value="25">25 itens</option>
                <option value="50">50 itens</option>
                <option value="100">100 itens</option>
              </select>
            </label>
          </div>
          <div className="report-filter-footer">
            <span>
              {hasFilters
                ? "O relatorio esta usando filtros personalizados."
                : "Sem filtros adicionais aplicados."}
            </span>
            {hasFilters ? (
              <Link className="button ghost" href={clearHref}>
                Limpar filtros
              </Link>
            ) : null}
          </div>
        </details>
      </div>
      {/* Implicit Enter-submit and the no-JS GET still need a submitter. */}
      <button className="sr-only" type="submit" tabIndex={-1}>
        Atualizar filtros
      </button>
    </form>
  );
}
