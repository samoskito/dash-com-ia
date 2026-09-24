"use client";

import type {
  CampaignOptionDto,
  MetaReportingAccountDto,
  WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import { Filter, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePresentationMode } from "../../../components/presentation-mode-toggle";
import { instanceLabel } from "./overview-labels";

type OverviewFiltersProps = {
  adAccountId?: string;
  businessId?: string;
  campaignId?: string;
  campaignName?: string;
  /** `null` when `/reports/campaign-options` failed; the field is disabled. */
  campaignOptions: CampaignOptionDto[] | null;
  hasActiveFilter: boolean;
  reportingAccounts: MetaReportingAccountDto[];
  since?: string;
  until?: string;
  whatsappInstanceId?: string;
  whatsappInstances: WhatsappInstanceSummaryDto[];
};

type CampaignOptionGroups =
  | { kind: "flat"; options: CampaignOptionDto[] }
  | {
      kind: "grouped";
      withLeads: CampaignOptionDto[];
      others: CampaignOptionDto[];
    };

const campaignLabelMaxLength = 60;
const accountsCollapseQuery = "(max-width: 620px)";

function businessesFromAccounts(accounts: MetaReportingAccountDto[]) {
  const businesses = new Map<string, string>();

  for (const account of accounts) {
    businesses.set(account.businessId, account.businessName);
  }

  return Array.from(businesses, ([id, name]) => ({ id, name }));
}

function byName(left: CampaignOptionDto, right: CampaignOptionDto) {
  return left.name.localeCompare(right.name, "pt-BR");
}

/**
 * A number never hides campaigns, it only regroups them: campaigns with
 * conversations on the selected number come first (most leads first), the
 * rest stay selectable under "Outras campanhas".
 */
export function groupCampaignOptions(
  options: CampaignOptionDto[],
  whatsappInstanceId: string,
): CampaignOptionGroups {
  if (!whatsappInstanceId) {
    return { kind: "flat", options: [...options].sort(byName) };
  }

  const leadsOn = (option: CampaignOptionDto) =>
    option.leadsByInstance[whatsappInstanceId] ?? 0;

  return {
    kind: "grouped",
    withLeads: options
      .filter((option) => leadsOn(option) > 0)
      .sort(
        (left, right) => leadsOn(right) - leadsOn(left) || byName(left, right),
      ),
    others: options.filter((option) => leadsOn(option) === 0).sort(byName),
  };
}

/** Whether a campaign option belongs to the BM/account scope being edited. */
export function campaignInScope(
  option: CampaignOptionDto | undefined,
  businessId: string,
  adAccountId: string,
): boolean {
  if (!option) {
    return !businessId && !adAccountId;
  }

  return (
    (!businessId || option.businessId === businessId) &&
    (!adAccountId || option.adAccountId === adAccountId)
  );
}

export function campaignOptionLabel(option: CampaignOptionDto): string {
  const name =
    option.name.length > campaignLabelMaxLength
      ? `${option.name.slice(0, campaignLabelMaxLength - 1).trimEnd()}…`
      : option.name;

  return option.status === "paused" ? `${name} · Pausada` : name;
}

export function OverviewFilters({
  adAccountId,
  businessId,
  campaignId,
  campaignName,
  campaignOptions,
  hasActiveFilter,
  reportingAccounts,
  since,
  until,
  whatsappInstanceId,
  whatsappInstances,
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
  const [selectedWhatsappInstanceId, setSelectedWhatsappInstanceId] = useState(
    whatsappInstanceId ?? "",
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    campaignId ?? "",
  );
  const accountFiltersActive = Boolean(businessId || adAccountId);
  // SSR renders the mobile layout (collapsed unless active). On wider screens
  // the details is `display: contents`, and the effect below keeps it open.
  const [accountsOpen, setAccountsOpen] = useState(accountFiltersActive);
  const accounts = useMemo(
    () =>
      selectedBusinessId
        ? reportingAccounts.filter(
            (account) => account.businessId === selectedBusinessId,
          )
        : reportingAccounts,
    [reportingAccounts, selectedBusinessId],
  );
  const activeWhatsappInstances = useMemo(
    () =>
      whatsappInstances.filter(
        (instance) => instance.billingStatus === "active",
      ),
    [whatsappInstances],
  );
  const selectedInstanceWasRemoved =
    Boolean(selectedWhatsappInstanceId) &&
    !activeWhatsappInstances.some(
      (instance) => instance.id === selectedWhatsappInstanceId,
    );
  const scopedCampaignOptions = useMemo(
    () =>
      (campaignOptions ?? []).filter((option) =>
        campaignInScope(option, selectedBusinessId, selectedAdAccountId),
      ),
    [campaignOptions, selectedAdAccountId, selectedBusinessId],
  );
  const campaignGroups = useMemo(
    () =>
      groupCampaignOptions(scopedCampaignOptions, selectedWhatsappInstanceId),
    [scopedCampaignOptions, selectedWhatsappInstanceId],
  );
  const selectedCampaignMissing =
    Boolean(selectedCampaignId) &&
    !scopedCampaignOptions.some((option) => option.id === selectedCampaignId);

  useEffect(() => {
    setSelectedBusinessId(businessId ?? "");
    setSelectedAdAccountId(adAccountId ?? "");
    setSelectedWhatsappInstanceId(whatsappInstanceId ?? "");
    setSelectedCampaignId(campaignId ?? "");
  }, [adAccountId, businessId, campaignId, whatsappInstanceId]);

  useEffect(() => {
    const media = window.matchMedia(accountsCollapseQuery);
    const sync = () =>
      setAccountsOpen(media.matches ? accountFiltersActive : true);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [accountFiltersActive]);

  function findCampaign(id: string) {
    return campaignOptions?.find((option) => option.id === id);
  }

  function clearCampaignOutsideScope(
    nextBusinessId: string,
    nextAdAccountId: string,
  ) {
    if (
      selectedCampaignId &&
      !campaignInScope(
        findCampaign(selectedCampaignId),
        nextBusinessId,
        nextAdAccountId,
      )
    ) {
      setSelectedCampaignId("");
    }
  }

  function handleBusinessChange(nextBusinessId: string) {
    setSelectedBusinessId(nextBusinessId);
    setSelectedAdAccountId("");
    clearCampaignOutsideScope(nextBusinessId, "");
  }

  function handleAccountChange(nextAdAccountId: string) {
    setSelectedAdAccountId(nextAdAccountId);
    clearCampaignOutsideScope(selectedBusinessId, nextAdAccountId);
  }

  const showBusinessFilter = businesses.length > 1;
  const showAccountFilter = reportingAccounts.length > 1;
  const showAccountGroup = showBusinessFilter || showAccountFilter;
  const accountFilterCount =
    Number(Boolean(selectedBusinessId)) + Number(Boolean(selectedAdAccountId));
  const campaignFieldDisabled =
    campaignOptions === null || campaignOptions.length === 0;
  const missingCampaignLabel = `${campaignName ?? "Campanha selecionada"} (sem dados no periodo)`;

  return (
    <form
      action="/overview"
      className={`overview-filter-bar${showAccountGroup ? "" : " single-row"}`}
      aria-label="Filtros da visao geral"
    >
      <div className="overview-filter-heading">
        <span className="micro-label">Recorte da analise</span>
      </div>

      <div
        className="overview-filter-group"
        role="group"
        aria-label="Periodo e contas"
      >
        <span className="micro-label overview-filter-group-label">
          Periodo e contas
        </span>
        <label className="filter-field">
          <span>Inicio</span>
          <input type="date" name="since" defaultValue={since} />
        </label>
        <label className="filter-field">
          <span>Fim</span>
          <input type="date" name="until" defaultValue={until} />
        </label>

        {showAccountGroup ? (
          <details
            className="overview-filter-accounts"
            open={accountsOpen}
            onToggle={(event) => setAccountsOpen(event.currentTarget.open)}
          >
            <summary>
              <span>Contas de anuncio</span>
              {accountFilterCount > 0 ? (
                <span className="tag">{accountFilterCount}</span>
              ) : null}
            </summary>

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
                    <span className="presentation-filter-placeholder">
                      BM oculto
                    </span>
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
                      handleAccountChange(event.currentTarget.value)
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
          </details>
        ) : null}
      </div>

      <div
        className="overview-filter-group overview-filter-group-cut"
        role="group"
        aria-label="Numero e campanha"
      >
        <span className="micro-label overview-filter-group-label">
          Numero e campanha
        </span>
        <label className="filter-field overview-scope-filter">
          <span>Numero WhatsApp</span>
          {presentationMode ? (
            <>
              <input
                type="hidden"
                name="whatsappInstanceId"
                value={selectedWhatsappInstanceId}
              />
              <span className="presentation-filter-placeholder">
                Numero oculto
              </span>
            </>
          ) : (
            <select
              name="whatsappInstanceId"
              value={selectedWhatsappInstanceId}
              onChange={(event) =>
                setSelectedWhatsappInstanceId(event.currentTarget.value)
              }
            >
              <option value="">Todos os numeros</option>
              {selectedInstanceWasRemoved ? (
                <option value={selectedWhatsappInstanceId}>
                  Numero removido
                </option>
              ) : null}
              {activeWhatsappInstances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instanceLabel(instance)}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="filter-field overview-scope-filter overview-campaign-filter">
          <span>Campanha</span>
          {presentationMode ? (
            <>
              <input
                type="hidden"
                name="campaignId"
                value={selectedCampaignId}
              />
              <span className="presentation-filter-placeholder">
                Campanha oculta
              </span>
            </>
          ) : campaignFieldDisabled ? (
            <>
              {/* Disabled selects are not submitted; keep an applied cut. */}
              {selectedCampaignId ? (
                <input
                  type="hidden"
                  name="campaignId"
                  value={selectedCampaignId}
                />
              ) : null}
              <select disabled value="">
                <option value="">
                  {campaignOptions === null
                    ? "Campanhas indisponiveis"
                    : "Nenhuma campanha no periodo"}
                </option>
              </select>
            </>
          ) : (
            <select
              name="campaignId"
              value={selectedCampaignId}
              onChange={(event) =>
                setSelectedCampaignId(event.currentTarget.value)
              }
            >
              <option value="">Todas as campanhas</option>
              {selectedCampaignMissing ? (
                <option value={selectedCampaignId}>
                  {missingCampaignLabel}
                </option>
              ) : null}
              {campaignGroups.kind === "flat" ? (
                campaignGroups.options.map(renderCampaignOption)
              ) : (
                <>
                  {campaignGroups.withLeads.length > 0 ? (
                    <optgroup label="Com conversas neste numero">
                      {campaignGroups.withLeads.map(renderCampaignOption)}
                    </optgroup>
                  ) : null}
                  {campaignGroups.others.length > 0 ? (
                    <optgroup label="Outras campanhas">
                      {campaignGroups.others.map(renderCampaignOption)}
                    </optgroup>
                  ) : null}
                </>
              )}
            </select>
          )}
        </label>

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
      </div>
    </form>
  );
}

function renderCampaignOption(option: CampaignOptionDto) {
  return (
    <option key={option.id} value={option.id} title={option.name}>
      {campaignOptionLabel(option)}
    </option>
  );
}
