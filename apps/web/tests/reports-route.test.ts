import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "../src/app/(app)/reports/page";

afterEach(() => {
  vi.restoreAllMocks();
});

function reportMetrics(overrides: Record<string, unknown> = {}) {
  return {
    spendCents: 120000,
    metaConversationsStarted: 176,
    costPerMetaConversationCents: 681,
    realConversations: 2,
    costPerRealConversationCents: 60000,
    organicLeads: 0,
    totalReceived: 2,
    trackingRate: 1,
    qualifiedLead: 1,
    costPerQualifiedLeadCents: 120000,
    purchases: 1,
    firstPurchases: 1,
    repurchases: 0,
    costPerPurchaseCents: 120000,
    trafficRevenueCents: 360000,
    organicRevenueCents: 0,
    totalRevenueCents: 360000,
    firstPurchaseRevenueCents: 360000,
    repurchaseRevenueCents: 0,
    roasAcquisition: 3,
    roasWithRepurchase: 3,
    funnelSteps: [
      {
        key: "real_conversations",
        label: "Conversas reais",
        value: 2,
        costCents: 60000,
      },
      {
        key: "qualified_lead",
        label: "Oportunidades",
        value: 1,
        costCents: 120000,
      },
      {
        key: "purchase",
        label: "Vendas",
        value: 1,
        costCents: 120000,
      },
      {
        key: "first_purchase",
        label: "Primeira compra",
        value: 1,
        costCents: 120000,
      },
    ],
    ...overrides,
  };
}

const campaignReport = {
  workspaceId: "workspace_1",
  rangeLabel: "Ultimos 7 dias",
  since: "2026-07-06",
  until: "2026-07-12",
  campaigns: [
    {
      id: "cmp_1",
      name: "Black Friday WhatsApp",
      status: "active",
      configuredStatus: "ACTIVE",
      effectiveStatus: "ACTIVE",
      whatsappClassification: "manual_include",
      budget: {
        owner: "campaign",
        type: "daily",
        amountCents: 49500,
        editable: true,
      },
      ...reportMetrics(),
    },
  ],
  totals: reportMetrics({ spendCents: 355205 }),
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 21,
    totalPages: 3,
  },
};

const adSetReport = {
  workspaceId: "workspace_1",
  rangeLabel: "Ultimos 7 dias",
  since: "2026-07-06",
  until: "2026-07-12",
  adSets: [
    {
      id: "adset_1",
      campaignId: "cmp_1",
      campaignName: "Black Friday WhatsApp",
      name: "Publico quente",
      status: "active",
      configuredStatus: "ACTIVE",
      effectiveStatus: "ACTIVE",
      budget: {
        owner: "campaign",
        type: "daily",
        amountCents: 49500,
        editable: false,
      },
      ...reportMetrics(),
    },
  ],
  totals: reportMetrics({ spendCents: 355205 }),
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 1,
    totalPages: 1,
  },
};

const adReport = {
  workspaceId: "workspace_1",
  rangeLabel: "Ultimos 7 dias",
  since: "2026-07-06",
  until: "2026-07-12",
  ads: [
    {
      id: "ad_1",
      campaignId: "cmp_1",
      campaignName: "Black Friday WhatsApp",
      adSetId: "adset_1",
      adSetName: "Publico quente",
      name: "Criativo WhatsApp",
      status: "active",
      configuredStatus: "ACTIVE",
      effectiveStatus: "ACTIVE",
      thumbnailUrl: "https://cdn.example.test/ad-1.jpg",
      previewUrl: "https://cdn.example.test/ad-1-large.jpg",
      ...reportMetrics(),
    },
  ],
  totals: reportMetrics({ spendCents: 355205 }),
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 1,
    totalPages: 1,
  },
};

const workspace = {
  id: "workspace_1",
  name: "Workspace",
  slug: "workspace",
  role: "owner",
  operationalStatus: "active",
  permissions: {
    canInviteMembers: true,
    canManageBilling: true,
    canManageIntegrations: true,
    canViewReports: true,
  },
};

const metaAssets = {
  workspaceId: "workspace_1",
  status: "connected",
  businesses: [],
  adAccounts: [],
  pixels: [],
  pages: [],
  reportingAccounts: [
    {
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      currency: "BRL",
      timezoneName: "America/Sao_Paulo",
      active: true,
      syncStatus: "synced",
      lastSyncedAt: "2026-07-12T10:00:00.000Z",
      lastSyncSince: "2026-07-06",
      lastSyncUntil: "2026-07-12",
      syncError: null,
    },
  ],
  selection: {
    businessId: null,
    adAccountId: null,
    pixelId: null,
  },
  conversionDestination: null,
  lastSyncedAt: "2026-07-10T10:00:00.000Z",
  syncError: null,
};

const metaStructure = {
  workspaceId: "workspace_1",
  campaigns: [
    {
      id: "cmp_1",
      name: "Black Friday WhatsApp",
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      objective: "OUTCOME_SALES",
      adSets: [
        {
          id: "adset_1",
          name: "Publico quente",
          status: "PAUSED",
          effectiveStatus: "PAUSED",
          ads: [
            {
              id: "ad_1",
              name: "Criativo WhatsApp",
              status: "RATE_LIMITED",
              effectiveStatus: "RATE_LIMITED",
            },
          ],
        },
      ],
    },
  ],
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockReportsApi(
  options: {
    fail?: boolean;
    member?: boolean;
    comparison?: typeof campaignReport;
  } = {},
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (options.fail) {
      return json({ message: "unavailable" }, 503);
    }

    if (url.includes("/workspaces/current")) {
      return json(
        options.member
          ? {
              ...workspace,
              role: "member",
              permissions: {
                ...workspace.permissions,
                canManageIntegrations: false,
              },
            }
          : workspace,
      );
    }

    if (url.includes("/integrations/meta/assets")) {
      return json(metaAssets);
    }

    if (url.includes("/reports/meta/structure")) {
      return json(metaStructure);
    }

    if (url.includes("/reports/adsets")) {
      return json(adSetReport);
    }

    if (url.includes("/reports/ads")) {
      return json(adReport);
    }

    if (url.includes("/reports/campaigns")) {
      return json(
        url.includes("since=2026-07-01") && options.comparison
          ? options.comparison
          : campaignReport,
      );
    }

    return json({ message: "not found" }, 404);
  });
}

async function renderReports(searchParams: Record<string, string> = {}) {
  const element = await ReportsPage({
    searchParams: Promise.resolve(searchParams),
  });

  return renderToStaticMarkup(createElement("div", null, element));
}

describe("reports route", () => {
  it("loads only campaigns in the default report view", async () => {
    const fetchMock = mockReportsApi();
    const html = await renderReports();
    const urls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(html).toContain("Black Friday WhatsApp");
    expect(html).toContain("Total do filtro");
    expect(html).toContain("21 campanhas");
    expect(html).toContain("Periodo: 06/07/2026 a 12/07/2026");
    expect(html).toContain("Meta: 06/07/2026 a 12/07/2026");
    expect(html).toContain("Proxima");
    expect(
      urls.some((url) => url.includes("/reports/campaigns?page=1&pageSize=10")),
    ).toBe(true);
    expect(urls.some((url) => url.includes("/reports/adsets"))).toBe(false);
    expect(urls.some((url) => /\/reports\/ads(?:\?|$)/.test(url))).toBe(false);
    expect(urls.some((url) => url.includes("/reports/meta/structure"))).toBe(
      false,
    );
  });

  it("loads only the selected ad set view", async () => {
    const fetchMock = mockReportsApi();
    const html = await renderReports({ view: "adsets" });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(html).toContain("Performance por conjunto");
    expect(html).toContain("Publico quente");
    expect(
      urls.some((url) => url.includes("/reports/adsets?page=1&pageSize=10")),
    ).toBe(true);
    expect(urls.some((url) => url.includes("/reports/campaigns"))).toBe(false);
    expect(urls.some((url) => /\/reports\/ads(?:\?|$)/.test(url))).toBe(false);
  });

  it("navigates the hierarchy by names and opens Leads only from real conversations", async () => {
    mockReportsApi();
    const campaignHtml = await renderReports();
    const adSetHtml = await renderReports({
      view: "adsets",
      campaignId: "cmp_1",
    });
    const adHtml = await renderReports({
      view: "ads",
      campaignId: "cmp_1",
      adSetId: "adset_1",
    });

    expect(campaignHtml).toContain(
      "campaignId=cmp_1&amp;page=1&amp;pageSize=10&amp;view=adsets",
    );
    expect(campaignHtml).toContain(
      'class="report-metric-link" href="/leads?campaignId=cmp_1',
    );
    expect(adSetHtml).toContain("Selecao atual");
    expect(adSetHtml).toContain("Black Friday WhatsApp");
    expect(adSetHtml).toContain(
      "campaignId=cmp_1&amp;adSetId=adset_1&amp;page=1&amp;pageSize=10&amp;view=ads",
    );
    expect(adHtml).toContain(
      "campaignId=cmp_1&amp;adSetId=adset_1&amp;adId=ad_1&amp;page=1&amp;pageSize=10&amp;view=ads",
    );
  });

  it("renders ad thumbnails, selection and controlled Meta actions", async () => {
    mockReportsApi();
    const campaignHtml = await renderReports();
    const adHtml = await renderReports({
      view: "ads",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
    });

    expect(campaignHtml).toContain(
      'aria-label="Alterar orcamento da campanha Black Friday WhatsApp"',
    );
    expect(campaignHtml).toContain(
      'aria-label="Pausar campanha Black Friday WhatsApp"',
    );
    expect(adHtml).toContain("https://cdn.example.test/ad-1.jpg");
    expect(adHtml).toContain("https://cdn.example.test/ad-1-large.jpg");
    expect(adHtml).toContain(
      'aria-label="Ampliar criativo do anuncio Criativo WhatsApp"',
    );
    expect(adHtml).toContain('class="is-selected"');
    expect(adHtml).toContain('name="adId" value="ad_1"');
  });

  it("shows the current WhatsApp review state in the action column", async () => {
    mockReportsApi();
    const html = await renderReports();

    expect(html).toContain("Incluido manualmente");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('class="review-actions"');
  });

  it("sends hierarchy selection to the selected report endpoint", async () => {
    const fetchMock = mockReportsApi();

    await renderReports({
      view: "ads",
      campaignId: "cmp_1",
      adSetId: "adset_1",
    });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(
      urls.some((url) =>
        url.includes(
          "/reports/ads?campaignId=cmp_1&adSetId=adset_1&page=1&pageSize=10",
        ),
      ),
    ).toBe(true);
  });

  it("preserves filters when navigating report pages", async () => {
    mockReportsApi();
    const html = await renderReports({
      businessId: "business_1",
      nameContains: "Black",
      page: "1",
    });

    expect(html).toContain(
      "businessId=business_1&amp;nameContains=Black&amp;nameScope=campaign&amp;page=2&amp;pageSize=10&amp;view=campaigns",
    );
  });

  it("loads campaign comparison only when it is requested", async () => {
    const comparison = {
      ...campaignReport,
      rangeLabel: "2026-07-01 a 2026-07-07",
      campaigns: [
        {
          ...campaignReport.campaigns[0],
          spendCents: 60000,
          metaConversationsStarted: 80,
        },
      ],
    };
    const fetchMock = mockReportsApi({ comparison });
    const html = await renderReports({
      since: "2026-07-08",
      until: "2026-07-14",
      compareSince: "2026-07-01",
      compareUntil: "2026-07-07",
    });
    const campaignCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/reports/campaigns"),
    );

    expect(campaignCalls).toHaveLength(2);
    expect(html).toContain("Comparacao entre periodos");
    expect(html).toContain("2026-07-01 a 2026-07-07");
  });

  it("loads the Meta technical structure only on demand", async () => {
    const fetchMock = mockReportsApi();
    const html = await renderReports({ diagnostic: "open" });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(urls.some((url) => url.includes("/reports/meta/structure"))).toBe(
      true,
    );
    expect(html).toContain("Estrutura tecnica recolhida");
    expect(html).toContain("Status desconhecido");
  });

  it("filters the technical structure without loading other report levels", async () => {
    const fetchMock = mockReportsApi();
    const html = await renderReports({
      structureNameContains: "Criativo",
      structureNameScope: "ad",
      structureStatus: "inactive",
    });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(html).toContain("Criativo WhatsApp");
    expect(urls.some((url) => url.includes("/reports/meta/structure"))).toBe(
      true,
    );
    expect(urls.some((url) => url.includes("/reports/adsets"))).toBe(false);
    expect(urls.some((url) => url.includes("/reports/ads"))).toBe(false);
  });

  it("renders API failure without pretending other report levels were loaded", async () => {
    mockReportsApi({ fail: true });
    const html = await renderReports();

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar campanhas");
    expect(html).not.toContain("Nao foi possivel carregar conjuntos");
    expect(html).not.toContain("Nao foi possivel carregar anuncios");
  });

  it("hides Meta synchronization from workspace members", async () => {
    mockReportsApi({ member: true });
    const html = await renderReports();

    expect(html).toContain("Sem permissao para sincronizar Meta");
    expect(html).not.toContain("Enfileirando leitura dos dados Meta");
  });
});
