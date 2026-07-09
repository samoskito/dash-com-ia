"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { SubmitButton } from "../../../components/submit-button";

type SaveMetaReportingAccountAction = (formData: FormData) => void | Promise<void>;
type SetMetaReportingAccountStatusAction = (
  formData: FormData
) => void | Promise<void>;
type LoadMetaBusinessReportingAssetsAction = (
  businessId: string
) => Promise<Pick<MetaAssetsDto, "adAccounts">>;

type MetaReportingAccountsFormProps = {
  action: SaveMetaReportingAccountAction;
  assets: MetaAssetsDto;
  loadBusinessAssetsAction: LoadMetaBusinessReportingAssetsAction;
  statusAction: SetMetaReportingAccountStatusAction;
};

function firstId<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? "";
}

export function metaReportingAccountsForBusiness(
  assets: MetaAssetsDto,
  businessId: string
) {
  if (!businessId) {
    return [];
  }

  return assets.adAccounts.filter((account) => account.businessId === businessId);
}

function initialBusinessId(assets: MetaAssetsDto): string {
  return assets.selection.businessId ?? firstId(assets.businesses);
}

function initialAdAccountId(assets: MetaAssetsDto, businessId: string): string {
  const selected = assets.selection.adAccountId;
  const accounts = metaReportingAccountsForBusiness(assets, businessId);

  return selected && accounts.some((account) => account.id === selected)
    ? selected
    : firstId(accounts);
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
  loadBusinessAssetsAction,
  statusAction
}: MetaReportingAccountsFormProps) {
  const [businessId, setBusinessId] = useState(() => initialBusinessId(assets));
  const [availableAdAccounts, setAvailableAdAccounts] = useState(
    () => assets.adAccounts
  );
  const [isLoadingBusinessAssets, setIsLoadingBusinessAssets] = useState(false);
  const loadSequence = useRef(0);
  const availableAccounts = useMemo(
    () =>
      metaReportingAccountsForBusiness(
        { ...assets, adAccounts: availableAdAccounts },
        businessId
      ),
    [assets, availableAdAccounts, businessId]
  );
  const [adAccountId, setAdAccountId] = useState(() =>
    initialAdAccountId(assets, initialBusinessId(assets))
  );
  const selectedBusiness = useMemo(
    () => assets.businesses.find((business) => business.id === businessId),
    [assets.businesses, businessId]
  );
  const selectedAdAccount = useMemo(
    () => availableAccounts.find((account) => account.id === adAccountId),
    [availableAccounts, adAccountId]
  );

  useEffect(() => {
    const nextBusinessId = initialBusinessId(assets);

    setBusinessId(nextBusinessId);
    setAvailableAdAccounts(assets.adAccounts);
    setAdAccountId(initialAdAccountId(assets, nextBusinessId));
  }, [assets]);

  async function handleBusinessChange(nextBusinessId: string) {
    const sequence = loadSequence.current + 1;

    loadSequence.current = sequence;
    setBusinessId(nextBusinessId);
    setAdAccountId("");

    if (!nextBusinessId) {
      setAvailableAdAccounts([]);
      setIsLoadingBusinessAssets(false);
      return;
    }

    setIsLoadingBusinessAssets(true);

    try {
      const nextAssets = await loadBusinessAssetsAction(nextBusinessId);

      if (loadSequence.current !== sequence) {
        return;
      }

      setAvailableAdAccounts(nextAssets.adAccounts);
      setAdAccountId(firstId(nextAssets.adAccounts));
    } catch {
      if (loadSequence.current !== sequence) {
        return;
      }

      setAvailableAdAccounts([]);
    } finally {
      if (loadSequence.current === sequence) {
        setIsLoadingBusinessAssets(false);
      }
    }
  }

  return (
    <>
      <form className="filter-bar" action={action}>
        <input type="hidden" name="businessName" value={selectedBusiness?.name ?? ""} />
        <input type="hidden" name="adAccountName" value={selectedAdAccount?.name ?? ""} />
        <input type="hidden" name="currency" value={selectedAdAccount?.currency ?? ""} />
        <input
          type="hidden"
          name="timezoneName"
          value={selectedAdAccount?.timezoneName ?? ""}
        />
        <select
          className="filter-control"
          name="businessId"
          value={businessId}
          onChange={(event) => handleBusinessChange(event.currentTarget.value)}
          aria-label="Business Manager para relatorios"
          disabled={isLoadingBusinessAssets}
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
          disabled={isLoadingBusinessAssets}
        >
          <option value="">Sem conta</option>
          {availableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <SubmitButton
          disabled={isLoadingBusinessAssets || !businessId || !adAccountId}
          pendingLabel="Salvando conta..."
          statusText="Adicionando conta aos relatorios."
        >
          {isLoadingBusinessAssets ? "Carregando contas" : "Adicionar conta"}
        </SubmitButton>
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
                      <SubmitButton
                        pendingLabel={account.active ? "Desativando..." : "Ativando..."}
                        statusText="Atualizando status da conta."
                      >
                        {account.active ? "Desativar" : "Ativar"}
                      </SubmitButton>
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
