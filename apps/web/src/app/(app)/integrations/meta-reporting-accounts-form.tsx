"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useMemo, useState } from "react";

type SaveMetaReportingAccountAction = (formData: FormData) => void | Promise<void>;
type SetMetaReportingAccountStatusAction = (
  formData: FormData
) => void | Promise<void>;

type MetaReportingAccountsFormProps = {
  action: SaveMetaReportingAccountAction;
  assets: MetaAssetsDto;
  statusAction: SetMetaReportingAccountStatusAction;
};

function firstId<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? "";
}

function accountsForBusiness(assets: MetaAssetsDto, businessId: string) {
  if (!businessId) {
    return [];
  }

  return assets.adAccounts.filter((account) => account.businessId === businessId);
}

function syncStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    syncing: "Sincronizando",
    synced: "Sincronizada",
    error: "Erro"
  };

  return labels[status] ?? "Status desconhecido";
}

export function MetaReportingAccountsForm({
  action,
  assets,
  statusAction
}: MetaReportingAccountsFormProps) {
  const [businessId, setBusinessId] = useState(
    () => assets.selection.businessId ?? firstId(assets.businesses)
  );
  const availableAccounts = useMemo(
    () => accountsForBusiness(assets, businessId),
    [assets, businessId]
  );
  const [adAccountId, setAdAccountId] = useState(
    () => assets.selection.adAccountId ?? firstId(availableAccounts)
  );

  function handleBusinessChange(nextBusinessId: string) {
    const nextAccounts = accountsForBusiness(assets, nextBusinessId);

    setBusinessId(nextBusinessId);
    setAdAccountId(firstId(nextAccounts));
  }

  return (
    <>
      <form className="filter-bar" action={action}>
        <select
          className="filter-control"
          name="businessId"
          value={businessId}
          onChange={(event) => handleBusinessChange(event.currentTarget.value)}
          aria-label="Business Manager para relatorios"
        >
          <option value="">Sem BM</option>
          {assets.businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
        <select
          className="filter-control"
          name="adAccountId"
          value={adAccountId}
          onChange={(event) => setAdAccountId(event.currentTarget.value)}
          aria-label="Conta de anuncio para relatorios"
        >
          <option value="">Sem conta</option>
          {availableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <button className="button" type="submit">
          Adicionar conta
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>BM</th>
              <th>Conta</th>
              <th>Moeda / timezone</th>
              <th>Sync</th>
              <th>Status</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {(assets.reportingAccounts ?? []).length > 0 ? (
              (assets.reportingAccounts ?? []).map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.businessName}</strong>
                    <span>{account.businessId}</span>
                  </td>
                  <td>
                    <strong>{account.adAccountName}</strong>
                    <span>{account.adAccountId}</span>
                  </td>
                  <td>
                    <strong>{account.currency ?? "sem moeda"}</strong>
                    <span>{account.timezoneName ?? "sem timezone"}</span>
                  </td>
                  <td>
                    <span className={`event-chip${account.syncStatus === "error" ? " warn" : ""}`}>
                      {syncStatusLabel(account.syncStatus)}
                    </span>
                    {account.syncError ? <span>{account.syncError}</span> : null}
                  </td>
                  <td>
                    <span className={`event-chip${account.active ? "" : " warn"}`}>
                      {account.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>
                    <form className="inline-form" action={statusAction}>
                      <input type="hidden" name="id" value={account.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={account.active ? "false" : "true"}
                      />
                      <button className="button" type="submit">
                        {account.active ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td>
                  <strong>Nenhuma conta configurada</strong>
                  <span>Adicione contas de anuncio para relatorios multi-conta.</span>
                </td>
                <td>sem conta</td>
                <td>sem moeda</td>
                <td><span className="event-chip warn">pendente</span></td>
                <td><span className="event-chip warn">inativa</span></td>
                <td>-</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
