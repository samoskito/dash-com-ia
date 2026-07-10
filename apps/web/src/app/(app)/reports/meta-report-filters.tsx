"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useEffect, useMemo, useState } from "react";

type MetaReportFiltersProps = {
  adAccountId?: string;
  assets: MetaAssetsDto | null;
  businessId?: string;
  compareSince?: string;
  compareUntil?: string;
  nameContains?: string;
  nameScope?: string;
  pageSize?: number;
  since?: string;
  status?: string;
  until?: string;
  view?: "campaigns" | "adsets" | "ads";
  whatsappClassification?: string;
};

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
  adAccountId,
  assets,
  businessId,
  compareSince,
  compareUntil,
  nameContains,
  nameScope = "campaign",
  pageSize = 10,
  since,
  status = "all",
  until,
  view = "campaigns",
  whatsappClassification = "whatsapp",
}: MetaReportFiltersProps) {
  const reportingAccounts = useMemo(
    () => (assets?.reportingAccounts ?? []).filter((account) => account.active),
    [assets?.reportingAccounts],
  );
  const businesses = useMemo(
    () => businessesFromReportingAccounts(reportingAccounts),
    [reportingAccounts],
  );
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    businessId ?? "",
  );
  const accounts = useMemo(
    () => accountsForBusiness(reportingAccounts, selectedBusinessId),
    [reportingAccounts, selectedBusinessId],
  );
  const [selectedAdAccountId, setSelectedAdAccountId] = useState(() =>
    validAdAccountId(
      accountsForBusiness(reportingAccounts, businessId ?? ""),
      adAccountId,
    ),
  );

  useEffect(() => {
    const nextBusinessId = businessId ?? "";
    const nextAccounts = accountsForBusiness(reportingAccounts, nextBusinessId);

    setSelectedBusinessId(nextBusinessId);
    setSelectedAdAccountId(validAdAccountId(nextAccounts, adAccountId));
  }, [adAccountId, businessId, reportingAccounts]);

  function handleBusinessChange(nextBusinessId: string) {
    setSelectedBusinessId(nextBusinessId);
    setSelectedAdAccountId("");
  }

  return (
    <form
      className="filter-bar"
      aria-label="Filtros Meta de relatorios"
      action="/reports"
    >
      <input type="hidden" name="since" value={since ?? ""} />
      <input type="hidden" name="until" value={until ?? ""} />
      <input type="hidden" name="compareSince" value={compareSince ?? ""} />
      <input type="hidden" name="compareUntil" value={compareUntil ?? ""} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="pageSize" value={pageSize} />
      <select
        className="filter-control"
        name="businessId"
        value={selectedBusinessId}
        onChange={(event) => handleBusinessChange(event.currentTarget.value)}
        aria-label="Filtrar por Business Manager"
      >
        <option value="">Todos os BMs</option>
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="adAccountId"
        value={selectedAdAccountId}
        onChange={(event) => setSelectedAdAccountId(event.currentTarget.value)}
        aria-label="Filtrar por conta de anuncio"
      >
        <option value="">Todas as contas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.adAccountId}>
            {account.adAccountName}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="nameScope"
        defaultValue={nameScope}
        aria-label="Tipo de filtro por nome"
      >
        {nameScopeOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="filter-control"
        name="nameContains"
        defaultValue={nameContains ?? ""}
        placeholder="Filtrar por nome"
        aria-label="Texto contido no nome"
      />
      <select
        className="filter-control"
        name="status"
        defaultValue={status}
        aria-label="Filtrar por status"
      >
        {statusOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="whatsappClassification"
        defaultValue={whatsappClassification}
        aria-label="Filtrar por classificacao WhatsApp"
      >
        {classificationOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button className="button" type="submit">
        Aplicar filtros
      </button>
    </form>
  );
}
