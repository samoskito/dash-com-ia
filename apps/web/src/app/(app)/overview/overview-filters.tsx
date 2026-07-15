"use client";

import type { MetaReportingAccountDto } from "@wpptrack/shared";
import { Filter, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePresentationMode } from "../../../components/presentation-mode-toggle";

type OverviewFiltersProps = {
  adAccountId?: string;
  businessId?: string;
  hasActiveFilter: boolean;
  reportingAccounts: MetaReportingAccountDto[];
  since?: string;
  until?: string;
};

function businessesFromAccounts(accounts: MetaReportingAccountDto[]) {
  const businesses = new Map<string, string>();

  for (const account of accounts) {
    businesses.set(account.businessId, account.businessName);
  }

  return Array.from(businesses, ([id, name]) => ({ id, name }));
}

export function OverviewFilters({
  adAccountId,
  businessId,
  hasActiveFilter,
  reportingAccounts,
  since,
  until,
}: OverviewFiltersProps) {
  const businesses = useMemo(
    () => businessesFromAccounts(reportingAccounts),
    [reportingAccounts],
  );
  const presentationMode = usePresentationMode();
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    businessId ?? "",
  );
  const [selectedAdAccountId, setSelectedAdAccountId] = useState(
    adAccountId ?? "",
  );
  const accounts = useMemo(
    () =>
      selectedBusinessId
        ? reportingAccounts.filter(
            (account) => account.businessId === selectedBusinessId,
          )
        : reportingAccounts,
    [reportingAccounts, selectedBusinessId],
  );

  useEffect(() => {
    setSelectedBusinessId(businessId ?? "");
    setSelectedAdAccountId(adAccountId ?? "");
  }, [adAccountId, businessId]);

  function handleBusinessChange(nextBusinessId: string) {
    setSelectedBusinessId(nextBusinessId);
    setSelectedAdAccountId("");
  }

  const showBusinessFilter = businesses.length > 1;
  const showAccountFilter = reportingAccounts.length > 1;

  return (
    <form
      action="/overview"
      className="overview-filter-bar"
      aria-label="Filtros da visao geral"
    >
      <div className="overview-filter-heading">
        <span className="micro-label">Recorte da analise</span>
        <strong>Periodo e contas</strong>
      </div>

      <label className="filter-field">
        <span>Inicio</span>
        <input type="date" name="since" defaultValue={since} />
      </label>
      <label className="filter-field">
        <span>Fim</span>
        <input type="date" name="until" defaultValue={until} />
      </label>

      {showBusinessFilter ? (
        <label className="filter-field overview-scope-filter">
          <span>Business Manager</span>
          {presentationMode ? (
            <>
              <input
                type="hidden"
                name="businessId"
                value={selectedBusinessId}
              />
              <span className="presentation-filter-placeholder">BM oculto</span>
            </>
          ) : (
            <select
              name="businessId"
              value={selectedBusinessId}
              onChange={(event) =>
                handleBusinessChange(event.currentTarget.value)
              }
            >
              <option value="">Todos os BMs</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      {showAccountFilter ? (
        <label className="filter-field overview-scope-filter">
          <span>Conta de anuncio</span>
          {presentationMode ? (
            <>
              <input
                type="hidden"
                name="adAccountId"
                value={selectedAdAccountId}
              />
              <span className="presentation-filter-placeholder">
                Conta oculta
              </span>
            </>
          ) : (
            <select
              name="adAccountId"
              value={selectedAdAccountId}
              onChange={(event) =>
                setSelectedAdAccountId(event.currentTarget.value)
              }
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.adAccountId}>
                  {account.adAccountName}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      <div className="overview-filter-actions">
        <button className="button primary" type="submit">
          <Filter size={15} aria-hidden="true" />
          Aplicar
        </button>
        {hasActiveFilter ? (
          <Link
            className="button ghost icon-button"
            href="/overview"
            aria-label="Limpar filtros"
            title="Limpar filtros"
          >
            <RotateCcw size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </form>
  );
}
