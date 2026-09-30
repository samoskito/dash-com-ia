"use client";

import type {
  CampaignOptionDto,
  MetaReportingAccountDto,
  WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  FilterCombobox,
  type FilterComboboxCopy,
  type FilterComboboxGroup,
  type FilterComboboxOption,
} from "../../../components/filter-combobox";
import { usePresentationMode } from "../../../components/presentation-mode-toggle";
import { instanceLabel } from "./overview-labels";
import { useOverviewTransition } from "./overview-pending";

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

/** Every overview filter, in canonical URL order ("" = not set). */
export type OverviewFilterValues = {
  since: string;
  until: string;
  businessId: string;
  adAccountId: string;
  whatsappInstanceId: string;
  campaignId: string;
};

const filterKeys = [
  "since",
  "until",
  "businessId",
  "adAccountId",
  "whatsappInstanceId",
  "campaignId",
] as const satisfies readonly (keyof OverviewFilterValues)[];

const campaignLabelMaxLength = 60;
const accountsCollapseQuery = "(max-width: 620px)";
/** Native date inputs emit intermediate years while typing (0002, 0020...). */
const dateCommitDelayMs = 800;
/** The product has no data before this year; lower years are half-typed. */
const minFilterYear = 2020;

const campaignComboboxCopy: FilterComboboxCopy = {
  all: "Todas as campanhas",
  searchPlaceholder: "Buscar campanha",
  searchLabel: "Buscar campanha por nome ou ID",
  count: (matches, total) => `${matches} de ${total} campanhas`,
  found: (matches) =>
    matches === 1
      ? "1 campanha encontrada"
      : `${matches} campanhas encontradas`,
  noResults: (query) => `Nenhuma campanha com "${query}"`,
  clearSearch: "Limpar busca",
};

const campaignComboboxGroups: FilterComboboxGroup[] = [
  { key: "with_leads", label: "Com conversas neste numero" },
  { key: "others", label: "Outras campanhas" },
];

/** Canonical, shareable href: fixed param order, empty params omitted. */
export function overviewFiltersHref(filters: OverviewFilterValues): string {
  const params = new URLSearchParams();

  for (const key of filterKeys) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }

  const query = params.toString();
  return query ? `/overview?${query}` : "/overview";
}

function isCommittableDate(value: string) {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return Boolean(match) && Number(match![1]) >= minFilterYear;
}

/**
 * A period only commits when both ends are complete, plausible dates and the
 * range is ordered. `"order"` is the only state worth telling the user about.
 */
export function dateRangeStatus(
  since: string,
  until: string,
): "valid" | "incomplete" | "order" {
  if (!isCommittableDate(since) || !isCommittableDate(until)) {
    return "incomplete";
  }

  return until < since ? "order" : "valid";
}

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

function conversationsOnNumber(count: number) {
  return `${count} ${count === 1 ? "conversa" : "conversas"} neste numero`;
}

function campaignComboboxOption(
  option: CampaignOptionDto,
  whatsappInstanceId: string,
  group?: string,
): FilterComboboxOption {
  const leads = whatsappInstanceId
    ? (option.leadsByInstance[whatsappInstanceId] ?? 0)
    : 0;

  return {
    value: option.id,
    label: campaignOptionLabel(option),
    title: option.name,
    description: leads > 0 ? conversationsOnNumber(leads) : undefined,
    group,
  };
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
  const router = useRouter();
  const [isPending, startTransition] = useOverviewTransition();
  const dateErrorId = useId();
  const businesses = useMemo(
    () => businessesFromAccounts(reportingAccounts),
    [reportingAccounts],
  );
  const presentationMode = usePresentationMode();
  const applied: OverviewFilterValues = {
    since: since ?? "",
    until: until ?? "",
    businessId: businessId ?? "",
    adAccountId: adAccountId ?? "",
    whatsappInstanceId: whatsappInstanceId ?? "",
    campaignId: campaignId ?? "",
  };
  const appliedHref = overviewFiltersHref(applied);
  // Local edits; the URL (props) is the source of truth once it lands.
  const [fields, setFields] = useState<OverviewFilterValues>(applied);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const lastSyncedRef = useRef(applied);
  const lastCommittedHrefRef = useRef(appliedHref);
  const dateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const wasPendingRef = useRef(false);
  const accountFiltersActive = Boolean(businessId || adAccountId);
  // SSR renders the mobile layout (collapsed unless active). On wider screens
  // the details is `display: contents`, and the effect below keeps it open.
  const [accountsOpen, setAccountsOpen] = useState(accountFiltersActive);
  const accounts = useMemo(
    () =>
      fields.businessId
        ? reportingAccounts.filter(
            (account) => account.businessId === fields.businessId,
          )
        : reportingAccounts,
    [reportingAccounts, fields.businessId],
  );
  const activeWhatsappInstances = useMemo(
    () =>
      whatsappInstances.filter(
        (instance) => instance.billingStatus === "active",
      ),
    [whatsappInstances],
  );
  const selectedInstanceWasRemoved =
    Boolean(fields.whatsappInstanceId) &&
    !activeWhatsappInstances.some(
      (instance) => instance.id === fields.whatsappInstanceId,
    );
  const scopedCampaignOptions = useMemo(
    () =>
      (campaignOptions ?? []).filter((option) =>
        campaignInScope(option, fields.businessId, fields.adAccountId),
      ),
    [campaignOptions, fields.adAccountId, fields.businessId],
  );
  const selectedCampaignMissing =
    Boolean(fields.campaignId) &&
    !scopedCampaignOptions.some((option) => option.id === fields.campaignId);
  const missingCampaignLabel = `${campaignName ?? "Campanha selecionada"} (sem dados no periodo)`;
  const comboboxOptions = useMemo(() => {
    const groups = groupCampaignOptions(
      scopedCampaignOptions,
      fields.whatsappInstanceId,
    );
    const missing: FilterComboboxOption[] = selectedCampaignMissing
      ? [{ value: fields.campaignId, label: missingCampaignLabel }]
      : [];
    const toOption = (option: CampaignOptionDto, group?: string) =>
      campaignComboboxOption(option, fields.whatsappInstanceId, group);

    return groups.kind === "flat"
      ? [...missing, ...groups.options.map((option) => toOption(option))]
      : [
          ...missing,
          ...groups.withLeads.map((option) => toOption(option, "with_leads")),
          ...groups.others.map((option) => toOption(option, "others")),
        ];
  }, [
    fields.campaignId,
    fields.whatsappInstanceId,
    missingCampaignLabel,
    scopedCampaignOptions,
    selectedCampaignMissing,
  ]);
  const dateStatus = dateRangeStatus(fields.since, fields.until);

  // Sync from the URL only once nothing is in flight, and only the fields the
  // URL actually changed: a late navigation must not overwrite a newer local
  // edit (e.g. a date still being typed), while Back/Forward must still land.
  useEffect(() => {
    if (isPending) {
      return;
    }

    const previous = lastSyncedRef.current;
    const changed = filterKeys.filter((key) => previous[key] !== applied[key]);

    lastCommittedHrefRef.current = appliedHref;

    if (changed.length === 0) {
      return;
    }

    lastSyncedRef.current = applied;
    setFields((current) => {
      const next = { ...current };

      for (const key of changed) {
        next[key] = applied[key];
      }

      return next;
    });
    // `applied` is rebuilt every render; its serialised form is the dependency.
  }, [appliedHref, isPending]);

  useEffect(() => {
    if (isPending) {
      wasPendingRef.current = true;
      setStatusMessage("");
    } else if (wasPendingRef.current) {
      wasPendingRef.current = false;
      setStatusMessage("Dados atualizados.");
    }
  }, [isPending]);

  useEffect(() => () => clearDateTimer(), []);

  useEffect(() => {
    const media = window.matchMedia(accountsCollapseQuery);
    const sync = () =>
      setAccountsOpen(media.matches ? accountFiltersActive : true);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [accountFiltersActive]);

  function clearDateTimer() {
    if (dateTimerRef.current) {
      clearTimeout(dateTimerRef.current);
      dateTimerRef.current = null;
    }
  }

  /** Navigates to the filters; an incomplete period keeps the applied one. */
  function commit(next: OverviewFilterValues) {
    clearDateTimer();

    const period =
      dateRangeStatus(next.since, next.until) === "valid"
        ? { since: next.since, until: next.until }
        : { since: applied.since, until: applied.until };
    const href = overviewFiltersHref({ ...next, ...period });

    if (href === lastCommittedHrefRef.current) {
      return;
    }

    lastCommittedHrefRef.current = href;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  function update(patch: Partial<OverviewFilterValues>) {
    const next = { ...fieldsRef.current, ...patch };

    fieldsRef.current = next;
    setFields(next);
    commit(next);
  }

  function campaignAfterScopeChange(
    nextBusinessId: string,
    nextAdAccountId: string,
  ) {
    const current = fieldsRef.current.campaignId;

    return current &&
      campaignInScope(
        campaignOptions?.find((option) => option.id === current),
        nextBusinessId,
        nextAdAccountId,
      )
      ? current
      : "";
  }

  function handleBusinessChange(nextBusinessId: string) {
    // One navigation for the BM and everything it invalidates.
    update({
      businessId: nextBusinessId,
      adAccountId: "",
      campaignId: campaignAfterScopeChange(nextBusinessId, ""),
    });
  }

  function handleAccountChange(nextAdAccountId: string) {
    update({
      adAccountId: nextAdAccountId,
      campaignId: campaignAfterScopeChange(
        fieldsRef.current.businessId,
        nextAdAccountId,
      ),
    });
  }

  function handleDateChange(key: "since" | "until", value: string) {
    const next = { ...fieldsRef.current, [key]: value };

    fieldsRef.current = next;
    setFields(next);
    clearDateTimer();

    if (dateRangeStatus(next.since, next.until) === "valid") {
      dateTimerRef.current = setTimeout(() => {
        dateTimerRef.current = null;
        commit(fieldsRef.current);
      }, dateCommitDelayMs);
    }
  }

  function flushDateCommit() {
    if (dateTimerRef.current) {
      commit(fieldsRef.current);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(fieldsRef.current);
  }

  const showBusinessFilter = businesses.length > 1;
  const showAccountFilter = reportingAccounts.length > 1;
  const showAccountGroup = showBusinessFilter || showAccountFilter;
  const accountFilterCount =
    Number(Boolean(fields.businessId)) + Number(Boolean(fields.adAccountId));
  const campaignDisabledLabel =
    campaignOptions === null
      ? "Campanhas indisponiveis"
      : campaignOptions.length === 0
        ? "Nenhuma campanha no periodo"
        : undefined;
  const dateOrderInvalid = dateStatus === "order";

  return (
    <form
      action="/overview"
      className={`overview-filter-bar${showAccountGroup ? "" : " single-row"}`}
      aria-label="Filtros da visao geral"
      onSubmit={handleSubmit}
    >
      <div className="overview-filter-heading">
        <span className="micro-label">Recorte da analise</span>
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
          <input
            type="date"
            name="since"
            value={fields.since}
            onChange={(event) =>
              handleDateChange("since", event.currentTarget.value)
            }
            onBlur={flushDateCommit}
          />
        </label>
        <label className="filter-field overview-date-end">
          <span>Fim</span>
          <input
            type="date"
            name="until"
            value={fields.until}
            aria-invalid={dateOrderInvalid ? "true" : undefined}
            aria-describedby={dateOrderInvalid ? dateErrorId : undefined}
            onChange={(event) =>
              handleDateChange("until", event.currentTarget.value)
            }
            onBlur={flushDateCommit}
          />
          {dateOrderInvalid ? (
            <span className="overview-filter-error" id={dateErrorId}>
              Fim antes do inicio
            </span>
          ) : null}
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
                      value={fields.businessId}
                    />
                    <span className="presentation-filter-placeholder">
                      BM oculto
                    </span>
                  </>
                ) : (
                  <select
                    name="businessId"
                    value={fields.businessId}
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
                      value={fields.adAccountId}
                    />
                    <span className="presentation-filter-placeholder">
                      Conta oculta
                    </span>
                  </>
                ) : (
                  <select
                    name="adAccountId"
                    value={fields.adAccountId}
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
                value={fields.whatsappInstanceId}
              />
              <span className="presentation-filter-placeholder">
                Numero oculto
              </span>
            </>
          ) : (
            <select
              name="whatsappInstanceId"
              value={fields.whatsappInstanceId}
              onChange={(event) =>
                update({ whatsappInstanceId: event.currentTarget.value })
              }
            >
              <option value="">Todos os numeros</option>
              {selectedInstanceWasRemoved ? (
                <option value={fields.whatsappInstanceId}>
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

        <FilterCombobox
          className="overview-scope-filter overview-campaign-filter"
          name="campaignId"
          label="Campanha"
          value={fields.campaignId ? [fields.campaignId] : []}
          options={comboboxOptions}
          groups={campaignComboboxGroups}
          copy={campaignComboboxCopy}
          disabledLabel={campaignDisabledLabel}
          presentationPlaceholder={
            presentationMode
              ? fields.campaignId
                ? "Campanha oculta"
                : campaignComboboxCopy.all
              : undefined
          }
          onCommit={(next) => update({ campaignId: next[0] ?? "" })}
        />

        <div
          className="overview-filter-status"
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
      </div>

      {/* Implicit Enter-submit and the no-JS GET still need a submitter. */}
      <button className="sr-only" type="submit" tabIndex={-1}>
        Atualizar recorte
      </button>
    </form>
  );
}
