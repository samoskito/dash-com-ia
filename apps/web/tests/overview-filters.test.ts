// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const presentation = vi.hoisted(() => ({ enabled: true }));

vi.mock("../src/components/presentation-mode-toggle", () => ({
  usePresentationMode: () => presentation.enabled,
}));

import { cleanup, fireEvent, render } from "@testing-library/react";
import type {
  CampaignOptionDto,
  MetaReportingAccountDto,
  WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OverviewFilters,
  campaignInScope,
  campaignOptionLabel,
  groupCampaignOptions,
} from "../src/app/(app)/overview/overview-filters";

type FiltersProps = ComponentProps<typeof OverviewFilters>;

function instance(
  overrides: Partial<WhatsappInstanceSummaryDto> = {},
): WhatsappInstanceSummaryDto {
  return {
    id: "instance_private",
    name: "Chip privado",
    provider: "uazapi",
    billingStatus: "active",
    providerInstanceId: "5511999991234",
    checkoutUrl: null,
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

function reportingAccount(
  overrides: Partial<MetaReportingAccountDto> = {},
): MetaReportingAccountDto {
  return {
    id: "reporting_1",
    workspaceId: "workspace_1",
    businessId: "business_1",
    businessName: "BM Principal",
    adAccountId: "act_1",
    adAccountName: "Conta Principal",
    currency: "BRL",
    timezoneName: "America/Sao_Paulo",
    active: true,
    syncStatus: "synced",
    lastSyncedAt: "2026-07-02T12:00:00.000Z",
    lastSyncSince: "2026-07-01",
    lastSyncUntil: "2026-07-02",
    syncError: null,
    ...overrides,
  } as MetaReportingAccountDto;
}

function campaignOption(
  overrides: Partial<CampaignOptionDto> = {},
): CampaignOptionDto {
  return {
    id: "cmp_1",
    name: "Promo Setembro",
    status: "active",
    businessId: "business_1",
    adAccountId: "act_1",
    leadsByInstance: {},
    ...overrides,
  };
}

const accounts = [
  reportingAccount(),
  reportingAccount({
    id: "reporting_2",
    businessId: "business_2",
    businessName: "BM Secundario",
    adAccountId: "act_2",
    adAccountName: "Conta Secundaria",
  }),
];

const instances = [
  instance({ id: "instance_a", name: "Loja Centro" }),
  instance({
    id: "instance_b",
    name: "Loja Norte",
    providerInstanceId: "5511999995678",
  }),
];

const options = [
  campaignOption({
    id: "cmp_centro",
    name: "Promo Centro",
    leadsByInstance: { instance_a: 12 },
  }),
  campaignOption({
    id: "cmp_norte",
    name: "Promo Norte",
    businessId: "business_2",
    adAccountId: "act_2",
    leadsByInstance: { instance_b: 4 },
  }),
  campaignOption({
    id: "cmp_nova",
    name: "Awareness Nova",
    status: "paused",
  }),
];

function filtersProps(overrides: Partial<FiltersProps> = {}): FiltersProps {
  return {
    campaignOptions: options,
    hasActiveFilter: true,
    reportingAccounts: accounts,
    whatsappInstances: instances,
    ...overrides,
  };
}

function renderMarkup(overrides: Partial<FiltersProps> = {}) {
  return renderToStaticMarkup(
    createElement(OverviewFilters, filtersProps(overrides)),
  );
}

function stubViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function optgroupOf(select: HTMLSelectElement, value: string) {
  const option = Array.from(select.options).find(
    (candidate) => candidate.value === value,
  );

  return option?.parentElement instanceof HTMLOptGroupElement
    ? option.parentElement.label
    : null;
}

beforeEach(() => {
  presentation.enabled = false;
  stubViewport(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("overview filters", () => {
  it("preserves the number filter while masking its option in presentation mode", () => {
    presentation.enabled = true;
    const html = renderMarkup({
      campaignOptions: [],
      reportingAccounts: [],
      whatsappInstanceId: "instance_private",
      whatsappInstances: [instance()],
    });

    expect(html).toContain("Numero WhatsApp");
    expect(html).toContain("Numero oculto");
    expect(html).not.toContain("Instancia");
    expect(html).toContain('name="whatsappInstanceId"');
    expect(html).toContain('value="instance_private"');
    expect(html).not.toContain("Chip privado");
    expect(html).not.toContain("1234");
  });

  it("renames the number field and marks a removed number", () => {
    const html = renderMarkup({ whatsappInstanceId: "instance_gone" });

    expect(html).toContain("Numero WhatsApp");
    expect(html).toContain("Todos os numeros");
    expect(html).toContain(
      '<option value="instance_gone" selected="">Numero removido</option>',
    );
    expect(html).toContain("Loja Centro - •••• 1234");
  });

  // §9 test 8
  it("renders Campanha after Numero WhatsApp in the Numero e campanha group", () => {
    const html = renderMarkup({ campaignId: "cmp_centro" });
    const numberPosition = html.indexOf("<span>Numero WhatsApp</span>");
    const campaignPosition = html.indexOf("<span>Campanha</span>");

    expect(html).toContain("Periodo e contas");
    expect(html).toContain("Numero e campanha");
    expect(html.indexOf("Numero e campanha")).toBeLessThan(numberPosition);
    expect(numberPosition).toBeGreaterThan(-1);
    expect(campaignPosition).toBeGreaterThan(numberPosition);
    expect(html).toContain('<select name="campaignId">');
    expect(html).toContain('<option value="">Todas as campanhas</option>');
    expect(html).toContain(
      '<option value="cmp_centro" title="Promo Centro" selected="">Promo Centro</option>',
    );
    expect(html).toContain("Awareness Nova · Pausada");
    // Limpar filtros goes back to the bare overview, dropping campaignId too.
    expect(html).toContain(
      'aria-label="Limpar filtros" title="Limpar filtros" href="/overview"',
    );
  });

  it("submits campaignId with the form", () => {
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({ campaignId: "cmp_centro" }),
      ),
    );
    const form = container.querySelector("form")!;
    const data = new FormData(form);

    expect(data.getAll("campaignId")).toEqual(["cmp_centro"]);
  });

  it("lists campaigns flat by name when no number is selected", () => {
    const html = renderMarkup();

    expect(html).not.toContain("<optgroup");
    expect(html.indexOf("Awareness Nova")).toBeLessThan(
      html.indexOf("Promo Centro"),
    );
    expect(html.indexOf("Promo Centro")).toBeLessThan(
      html.indexOf("Promo Norte"),
    );
  });

  it("groups campaigns by conversations on the selected number", () => {
    const html = renderMarkup({ whatsappInstanceId: "instance_a" });
    const withLeads = html.indexOf(
      '<optgroup label="Com conversas neste numero">',
    );
    const others = html.indexOf('<optgroup label="Outras campanhas">');

    expect(withLeads).toBeGreaterThan(-1);
    expect(others).toBeGreaterThan(withLeads);
    expect(html.indexOf("Promo Centro")).toBeGreaterThan(withLeads);
    expect(html.indexOf("Promo Centro")).toBeLessThan(others);
    expect(html.indexOf("Promo Norte")).toBeGreaterThan(others);
  });

  it("sorts the conversations group by leads on the number, then name", () => {
    const grouped = groupCampaignOptions(
      [
        campaignOption({ id: "b", name: "B", leadsByInstance: { n1: 3 } }),
        campaignOption({ id: "a", name: "A", leadsByInstance: { n1: 3 } }),
        campaignOption({ id: "c", name: "C", leadsByInstance: { n1: 9 } }),
        campaignOption({ id: "z", name: "Z", leadsByInstance: { n2: 5 } }),
      ],
      "n1",
    );

    expect(grouped).toEqual({
      kind: "grouped",
      withLeads: [
        expect.objectContaining({ id: "c" }),
        expect.objectContaining({ id: "a" }),
        expect.objectContaining({ id: "b" }),
      ],
      others: [expect.objectContaining({ id: "z" })],
    });
  });

  it("truncates long campaign names in the label only", () => {
    const longName = `[CTWA] ${"Promocao de primavera ".repeat(5)}`.trim();
    const label = campaignOptionLabel(
      campaignOption({ name: longName, status: "paused" }),
    );

    expect(label.endsWith("… · Pausada")).toBe(true);
    expect(label.length).toBeLessThanOrEqual(60 + " · Pausada".length);
    expect(
      renderMarkup({
        campaignOptions: [campaignOption({ name: longName })],
      }),
    ).toContain(`title="${longName}"`);
  });

  // §9 test 9
  it("clears a campaign from another BM when the BM changes", () => {
    const { container } = render(
      createElement(OverviewFilters, filtersProps({ campaignId: "cmp_norte" })),
    );
    const business = container.querySelector<HTMLSelectElement>(
      'select[name="businessId"]',
    )!;
    const campaign = () =>
      container.querySelector<HTMLSelectElement>('select[name="campaignId"]')!;

    expect(campaign().value).toBe("cmp_norte");

    fireEvent.change(business, { target: { value: "business_1" } });

    expect(campaign().value).toBe("");
    expect(
      Array.from(campaign().options).map((option) => option.value),
    ).not.toContain("cmp_norte");
  });

  it("keeps a campaign inside the new BM when the BM changes", () => {
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({ campaignId: "cmp_centro" }),
      ),
    );

    fireEvent.change(container.querySelector('select[name="businessId"]')!, {
      target: { value: "business_1" },
    });

    expect(
      container.querySelector<HTMLSelectElement>('select[name="campaignId"]')!
        .value,
    ).toBe("cmp_centro");
  });

  it("clears a campaign outside the account when the account changes", () => {
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({ campaignId: "cmp_centro" }),
      ),
    );

    fireEvent.change(container.querySelector('select[name="adAccountId"]')!, {
      target: { value: "act_2" },
    });

    expect(
      container.querySelector<HTMLSelectElement>('select[name="campaignId"]')!
        .value,
    ).toBe("");
  });

  it("keeps the campaign when the number changes and moves it between optgroups", () => {
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({
          campaignId: "cmp_centro",
          whatsappInstanceId: "instance_a",
        }),
      ),
    );
    const campaign = () =>
      container.querySelector<HTMLSelectElement>('select[name="campaignId"]')!;

    expect(optgroupOf(campaign(), "cmp_centro")).toBe(
      "Com conversas neste numero",
    );

    fireEvent.change(
      container.querySelector('select[name="whatsappInstanceId"]')!,
      { target: { value: "instance_b" } },
    );

    expect(campaign().value).toBe("cmp_centro");
    expect(optgroupOf(campaign(), "cmp_centro")).toBe("Outras campanhas");
    expect(optgroupOf(campaign(), "cmp_norte")).toBe(
      "Com conversas neste numero",
    );
  });

  it("scopes campaign options by BM and account", () => {
    const option = campaignOption();

    expect(campaignInScope(option, "", "")).toBe(true);
    expect(campaignInScope(option, "business_1", "")).toBe(true);
    expect(campaignInScope(option, "business_2", "")).toBe(false);
    expect(campaignInScope(option, "business_1", "act_2")).toBe(false);
    expect(campaignInScope(undefined, "business_1", "")).toBe(false);
  });

  it("keeps an applied campaign missing from the period as a synthetic option", () => {
    const html = renderMarkup({
      campaignId: "cmp_old",
      campaignName: "Promo Julho",
    });

    expect(html).toContain(
      '<option value="cmp_old" selected="">Promo Julho (sem dados no periodo)</option>',
    );
  });

  // §9 test 10
  it("masks every campaign name in presentation mode and keeps the value", () => {
    presentation.enabled = true;
    const html = renderMarkup({
      campaignId: "cmp_centro",
      campaignName: "Promo Centro",
      whatsappInstanceId: "instance_a",
    });

    expect(html).toContain("Campanha oculta");
    expect(html).toContain(
      '<input type="hidden" name="campaignId" value="cmp_centro"/>',
    );
    expect(html).not.toContain("Promo Centro");
    expect(html).not.toContain("Promo Norte");
    expect(html).not.toContain("Awareness Nova");
    expect(html.match(/name="campaignId"/g)).toHaveLength(1);
  });

  // §9 test 14
  it("disables the campaign field when the options endpoint fails", () => {
    const html = renderMarkup({ campaignOptions: null });

    expect(html).toContain(
      '<select disabled=""><option value="" selected="">Campanhas indisponiveis</option></select>',
    );
    expect(html).not.toContain('name="campaignId"');
  });

  it("keeps an applied campaign when the options endpoint fails", () => {
    const html = renderMarkup({
      campaignId: "cmp_centro",
      campaignOptions: null,
    });

    expect(html).toContain(
      '<input type="hidden" name="campaignId" value="cmp_centro"/>',
    );
    expect(html.match(/name="campaignId"/g)).toHaveLength(1);
  });

  it("disables the campaign field when the period has no campaigns", () => {
    const html = renderMarkup({ campaignOptions: [] });

    expect(html).toContain("Nenhuma campanha no periodo");
    expect(html).toContain("<select disabled=");
  });

  // §9 test 15
  it("collapses BM/Conta on mobile and keeps number and campaign visible", () => {
    stubViewport(true);
    const { container } = render(
      createElement(OverviewFilters, filtersProps()),
    );
    const details = container.querySelector<HTMLDetailsElement>(
      "details.overview-filter-accounts",
    )!;

    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe(
      "Contas de anuncio",
    );
    expect(details.querySelector('select[name="businessId"]')).not.toBeNull();
    expect(details.querySelector('select[name="adAccountId"]')).not.toBeNull();
    expect(details.querySelector('[name="whatsappInstanceId"]')).toBeNull();
    expect(details.querySelector('[name="campaignId"]')).toBeNull();
    expect(
      container.querySelector(
        ".overview-filter-group-cut select[name='whatsappInstanceId']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        ".overview-filter-group-cut select[name='campaignId']",
      ),
    ).not.toBeNull();
  });

  it("opens the mobile accounts section with a count when BM/Conta is active", () => {
    stubViewport(true);
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({ businessId: "business_1", adAccountId: "act_1" }),
      ),
    );
    const details = container.querySelector<HTMLDetailsElement>(
      "details.overview-filter-accounts",
    )!;

    expect(details.open).toBe(true);
    expect(details.querySelector("summary .tag")?.textContent).toBe("2");
  });

  it("keeps the accounts section open on desktop", () => {
    const { container } = render(
      createElement(OverviewFilters, filtersProps()),
    );

    expect(
      container.querySelector<HTMLDetailsElement>(
        "details.overview-filter-accounts",
      )!.open,
    ).toBe(true);
  });

  it("submits exactly one value per filter name", () => {
    const { container } = render(
      createElement(
        OverviewFilters,
        filtersProps({
          adAccountId: "act_1",
          businessId: "business_1",
          campaignId: "cmp_centro",
          since: "2026-09-01",
          until: "2026-09-24",
          whatsappInstanceId: "instance_a",
        }),
      ),
    );
    const data = new FormData(container.querySelector("form")!);

    for (const name of [
      "since",
      "until",
      "businessId",
      "adAccountId",
      "whatsappInstanceId",
      "campaignId",
    ]) {
      expect(data.getAll(name)).toHaveLength(1);
    }
  });

  it("merges both groups into one row when there is a single account", () => {
    const html = renderMarkup({ reportingAccounts: [reportingAccount()] });

    expect(html).toContain('class="overview-filter-bar single-row"');
    expect(html).not.toContain("overview-filter-accounts");
  });
});
