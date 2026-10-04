// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  InboundWebhookCapabilitiesDto,
  MetaManualConfigurationDto,
} from "@wpptrack/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InboundWebhookPanel,
  inboundWebhookProviderLabel,
  type InboundWebhookConnectionView,
} from "../src/app/(app)/integrations/inbound-webhook-panel";
import { inboundWebhookReportingAccountOptions } from "../src/app/(app)/integrations/inbound-webhook-route-editor";
import type { WhatsappInstanceActivities } from "../src/app/(app)/integrations/whatsapp-instance-activity";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
  }),
}));

const capabilities = {
  enabled: true,
  productionEnabled: true,
  providers: [
    {
      provider: "umbler",
      parserVersion: "umbler/v1",
      parserReleaseStatus: "observation_only",
      creationEnabled: true,
    },
    {
      provider: "gupshup",
      parserVersion: "v1",
      parserReleaseStatus: "observation_only",
      creationEnabled: true,
    },
    {
      provider: "gohighlevel",
      parserVersion: "v1",
      parserReleaseStatus: null,
      creationEnabled: false,
    },
  ],
} satisfies InboundWebhookCapabilitiesDto;

const capabilitiesWithGoHighLevel = {
  ...capabilities,
  providers: capabilities.providers.map((provider) =>
    provider.provider === "gohighlevel"
      ? { ...provider, creationEnabled: true }
      : provider,
  ),
} satisfies InboundWebhookCapabilitiesDto;

afterEach(() => {
  cleanup();
});

const connectionView = {
  overview: {
    connection: {
      id: "connection_1",
      workspaceId: "workspace_current",
      provider: "umbler",
      displayName: "Umbler Comercial",
      parserVersion: "umbler/v1",
      parserReleaseStatus: "observation_only",
      status: "observation",
      productionActivatedAt: null,
      lastDeliveryAt: "2026-07-17T19:35:00.000Z",
      lastSuccessfulParseAt: "2026-07-17T19:34:00.000Z",
      createdAt: "2026-07-17T18:00:00.000Z",
      updatedAt: "2026-07-17T19:35:00.000Z",
    },
    counters: {
      eligibleRouted: 12,
      eligibleUnresolved: 5,
      ignoredNoCtwa: 8,
      duplicate: 3,
      invalid: 2,
    },
  },
  channels: [
    {
      id: "channel_1",
      connectionId: "connection_1",
      organizationId: "organization_1",
      providerChannelId: "umbler_channel_1",
      connectedPhone: "+5511999990001",
      channelName: "Comercial Sao Paulo",
      whatsappInstanceId: null,
      status: "active",
      productionActivatedAt: null,
      firstSeenAt: "2026-07-17T18:15:00.000Z",
      lastSeenAt: "2026-07-17T19:30:00.000Z",
      routes: [
        inboundRoute({
          id: "route_sales",
          metaBusinessConnectionId: "business_connection_sales",
          metaReportingAccountId: "reporting_sales",
          metaConversionDestinationId: "destination_sales",
        }),
        inboundRoute({
          id: "route_support",
          metaBusinessConnectionId: "business_connection_support",
          metaReportingAccountId: "reporting_support",
          metaConversionDestinationId: "destination_support",
        }),
      ],
      readiness: {
        state: "partial",
        blockers: ["ctwa_unresolved", "payload_expiring_soon"],
        routeCount: 2,
        validRouteCount: 2,
        totalCtwa: 17,
        routedCtwa: 12,
        unresolvedCtwa: 5,
        retainedCtwa: 17,
        retainedRoutedCtwa: 12,
        payloadUnavailableCtwa: 0,
        alreadyMaterializedCtwa: 0,
        nextPayloadExpiresAt: "2026-07-19T18:00:00.000Z",
      },
      createdAt: "2026-07-17T18:15:00.000Z",
      updatedAt: "2026-07-17T19:30:00.000Z",
    },
  ],
} satisfies InboundWebhookConnectionView;

const metaConfiguration = {
  workspaceId: "workspace_current",
  connectionMode: "manual",
  advancedRoutingEnabled: false,
  unmappedActiveAccountCount: 0,
  credentials: [],
  businessConnections: [
    metaBusinessConnection({
      id: "business_connection_sales",
      businessManagerId: "bm_sales",
      businessManagerName: "BM Vendas Atual",
      defaultConversionDestinationId: "destination_sales",
    }),
    metaBusinessConnection({
      id: "business_connection_support",
      businessManagerId: "bm_support",
      businessManagerName: "BM Suporte Atual",
      defaultConversionDestinationId: "destination_support",
    }),
  ],
  destinations: [
    metaDestination({
      id: "destination_sales",
      label: "Pixel e Pagina Vendas",
      ownerBusinessManagerId: "bm_sales",
      pixelId: "pixel_sales",
      pixelName: "Pixel Vendas",
      pageId: "page_sales",
      pageName: "Pagina Vendas",
    }),
    metaDestination({
      id: "destination_support",
      label: "Pixel e Pagina Suporte",
      ownerBusinessManagerId: "bm_support",
      pixelId: "pixel_support",
      pixelName: "Pixel Suporte",
      pageId: "page_support",
      pageName: "Pagina Suporte",
    }),
  ],
  reportingAccounts: [
    metaReportingAccount({
      id: "reporting_sales",
      businessId: "bm_sales",
      businessName: "BM Vendas Atual",
      adAccountId: "act_sales",
      adAccountName: "Conta Vendas Atual",
      businessConnectionId: "business_connection_sales",
      conversionDestinationId: "destination_sales",
    }),
    metaReportingAccount({
      id: "reporting_support",
      businessId: "bm_support",
      businessName: "BM Suporte Atual",
      adAccountId: "act_support",
      adAccountName: "Conta Suporte Atual",
      businessConnectionId: "business_connection_support",
      conversionDestinationId: "destination_support",
    }),
  ],
} satisfies MetaManualConfigurationDto;

describe("inbound webhook panel", () => {
  it("keeps the submitted form reference across the async create action", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../src/app/(app)/integrations/inbound-webhook-panel.tsx",
      ),
      "utf8",
    );
    const handler = source.slice(
      source.indexOf("async function handleCreate"),
      source.indexOf("async function runConnectionAction"),
    );

    expect(handler).toMatch(/const form = event\.currentTarget;/);
    expect(handler).toMatch(/await createAction\(new FormData\(form\)\)/);
    expect(handler).toMatch(/form\.reset\(\)/);
    expect(handler).not.toMatch(
      /await createAction\(new FormData\(event\.currentTarget\)\)/,
    );
  });

  it("labels Go High Level while keeping the selector extensible", () => {
    const html = renderPanel({ connections: [] });

    expect(inboundWebhookProviderLabel("umbler")).toBe("Umbler Talk");
    expect(inboundWebhookProviderLabel("gupshup")).toBe("Gupshup");
    expect(inboundWebhookProviderLabel("gohighlevel")).toBe("Go High Level");
    expect(inboundWebhookProviderLabel("future-provider")).toBe(
      "future-provider",
    );
    expect(html).toContain('<select name="provider"');
    expect(html).toContain('<option value="umbler" selected="">Umbler Talk');
    expect(html).toContain('<option value="gupshup">Gupshup</option>');
    expect(html).not.toContain('<option value="gohighlevel">Go High Level</option>');
    expect(html).toContain("controle quais canais enviam conversoes");
  });

  it("shows required GHL binding fields and does not submit without them", async () => {
    const user = userEvent.setup();
    const createAction = vi.fn(async (_formData: FormData) => ({
      ok: true as const,
      message: "ok",
    }));

    renderCreateForm({ createAction, capabilities: capabilitiesWithGoHighLevel });
    await user.selectOptions(screen.getByLabelText("Plataforma"), "gohighlevel");

    expect(
      screen.getByLabelText("Location ID (GHL location.id)"),
    ).toHaveProperty("required", true);
    expect(screen.getByLabelText("Clinic WhatsApp")).toHaveProperty(
      "required",
      true,
    );
    expect(
      screen.getByText(
        "Este e o WhatsApp da clinica, nao o telefone do paciente.",
      ),
    ).not.toBeNull();

    await user.type(
      screen.getByLabelText("Nome da conexao"),
      "Clinica Central",
    );
    await user.click(screen.getByRole("button", { name: "Gerar webhook" }));

    expect(createAction).not.toHaveBeenCalled();
  });

  it("submits the GHL location and clinic WhatsApp binding", async () => {
    const user = userEvent.setup();
    const createAction = vi.fn(async (_formData: FormData) => ({
      ok: true as const,
      message: "ok",
    }));

    renderCreateForm({ createAction, capabilities: capabilitiesWithGoHighLevel });
    await user.selectOptions(screen.getByLabelText("Plataforma"), "gohighlevel");
    await user.type(
      screen.getByLabelText("Nome da conexao"),
      "Clinica Central",
    );
    await user.type(
      screen.getByLabelText("Location ID (GHL location.id)"),
      "location_123",
    );
    await user.type(screen.getByLabelText("Clinic WhatsApp"), "+5511999990001");
    await user.click(screen.getByRole("button", { name: "Gerar webhook" }));

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(createAction.mock.calls[0]![0])).toEqual({
      provider: "gohighlevel",
      displayName: "Clinica Central",
      locationId: "location_123",
      connectedPhone: "+5511999990001",
    });
  });

  it.each(["umbler", "gupshup"])(
    "keeps %s creation data limited to provider and display name",
    async (provider) => {
      const user = userEvent.setup();
      const createAction = vi.fn(async (_formData: FormData) => ({
        ok: true as const,
        message: "ok",
      }));

      renderCreateForm({ createAction, capabilities: capabilitiesWithGoHighLevel });
      await user.selectOptions(screen.getByLabelText("Plataforma"), provider);
      expect(
        screen.queryByLabelText("Location ID (GHL location.id)"),
      ).toBeNull();
      expect(screen.queryByLabelText("Clinic WhatsApp")).toBeNull();
      await user.type(
        screen.getByLabelText("Nome da conexao"),
        `${provider} Comercial`,
      );
      await user.click(screen.getByRole("button", { name: "Gerar webhook" }));

      await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
      expect(Object.fromEntries(createAction.mock.calls[0]![0])).toEqual({
        provider,
        displayName: `${provider} Comercial`,
      });
    },
  );

  it("keeps integrations focused on connection health and links to trigger settings", () => {
    const html = renderPanel();

    expect(html).toContain("Gatilhos de conversao");
    expect(html).toContain("0 regra(s) nesta conexao");
    expect(html).toContain('href="/settings#whatsapp-triggers"');
    expect(html).toContain("Gerenciar gatilhos");
    expect(html).not.toContain("Qualificados e compras");
  });

  it("renders all five counters, channel metadata, and several N:N routes", () => {
    const html = renderPanel();
    const channel = connectionView.channels[0];
    const expectedLastSeen = new Date(channel.lastSeenAt).toLocaleString(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      },
    );

    for (const [label, value] of [
      ["CTWA roteado", 12],
      ["CTWA pendente", 5],
      ["Sem CTWA", 8],
      ["Duplicados", 3],
      ["Invalidos", 2],
    ] as const) {
      expect(html).toContain(`<span>${label}</span><strong>${value}</strong>`);
    }

    expect(html).toContain('class="inbound-connection"');
    expect(html).not.toContain('<details class="inbound-connection" open="">');
    expect(html).toContain("12 roteados");
    expect(html).toContain("5 pendentes");
    expect(html).toContain("Comercial Sao Paulo");
    expect(html).toContain("+5511999990001");
    expect(html).toContain(expectedLastSeen);
    expect(html.match(/class="inbound-route-row"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="BM da rota 1"');
    expect(html).toContain('aria-label="BM da rota 2"');
    expect(html).toContain("2 rota(s) preparada(s).");
  });

  it("shows redacted readiness and exact blockers for each channel", () => {
    const html = renderPanel();
    const expectedExpiry = new Date(
      connectionView.channels[0].readiness.nextPayloadExpiresAt!,
    ).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    });

    expect(html).toContain("Prontidao parcial");
    expect(html).toContain("<span>Rotas validas</span><strong>2/2</strong>");
    expect(html).toContain("<span>CTWA observados</span><strong>17</strong>");
    expect(html).toContain(
      "<span>Roteados preservados</span><strong>12</strong>",
    );
    expect(html).toContain("<span>CTWA pendentes</span><strong>5</strong>");
    expect(html).toContain("5 CTWA aguardam uma rota Meta exata.");
    expect(html).toContain(
      "O payload preservado mais proximo expira em menos de 48 horas.",
    );
    expect(html).toContain(expectedExpiry);
    expect(html).not.toContain("CTWaCLId");
    expect(html).not.toContain("encryptedPayload");
  });

  it("uses only the supplied workspace Meta options for each exact route", () => {
    expect(
      inboundWebhookReportingAccountOptions(
        metaConfiguration,
        "business_connection_sales",
      ),
    ).toEqual([
      {
        value: "reporting_sales",
        label: "Conta Vendas Atual",
        description: "act_sales",
      },
    ]);

    const html = renderPanel();

    for (const value of [
      "BM Vendas Atual",
      "BM Suporte Atual",
      "Conta Vendas Atual",
      "Conta Suporte Atual",
      "Pixel e Pagina Vendas",
      "Pixel e Pagina Suporte",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("workspace_foreign");
    expect(html).not.toContain("Conta Foreign");
  });

  it("enables manager commands while keeping analyst routes visible and read-only", () => {
    const managerHtml = renderPanel({ canManage: true });
    const analystHtml = renderPanel({ canManage: false });

    for (const command of [
      "Adicionar conexao",
      "Ativar envios automaticos",
      "Pausar conexao",
      "Gerar nova URL",
      "Remover",
      "Pausar envio",
      "Adicionar rota",
      "Salvar rotas",
    ]) {
      expect(managerHtml).toContain(command);
    }
    expect(managerHtml).toContain('aria-readonly="false"');

    expect(analystHtml).toContain("Rotas visiveis em modo somente leitura.");
    expect(analystHtml).toContain("2 rota(s) configurada(s).");
    expect(analystHtml).toContain("BM Vendas Atual");
    expect(analystHtml).toContain("Conta Suporte Atual");
    expect(analystHtml).toContain('aria-readonly="true"');
    expect(analystHtml).not.toContain("Adicionar conexao");
    expect(analystHtml).not.toContain("Gerar nova URL");
    expect(analystHtml).not.toContain("Pausar envio");
    expect(analystHtml).not.toContain("Adicionar rota");
    expect(analystHtml).not.toContain("Salvar rotas");
  });

  it("does not offer secret rotation for UAZAPI instance bridges", () => {
    const html = renderPanel({
      connections: [
        {
          ...connectionView,
          overview: {
            ...connectionView.overview,
            connection: {
              ...connectionView.overview.connection,
              provider: "uazapi",
            },
          },
        },
      ],
    });

    expect(html).not.toContain("Gerar nova URL");
    expect(html).toContain(
      "UAZAPI usa o webhook da instancia; gerar URL aqui quebra o recebimento.",
    );
  });

  it("marks connection, channel, number, BM, account, Pixel, and Page as private", () => {
    const html = renderPanel();

    for (const placeholder of [
      "Conexao WhatsApp",
      "Canal oculto",
      "Numero oculto",
      "BM oculta",
      "Conta oculta",
      "Pixel e Pagina ocultos",
    ]) {
      expect(html).toContain(placeholder);
    }
    expect(html).toContain('data-presentation-sensitive="true"');
    expect(html).toContain('data-presentation-sensitive-field="true"');
  });
});

describe("inbound webhook panel UAZAPI bridge", () => {
  const uazapiView = {
    overview: {
      connection: {
        ...connectionView.overview.connection,
        id: "connection_uazapi",
        provider: "uazapi",
        displayName: "UAZAPI Vendas",
      },
      counters: {
        eligibleRouted: 7,
        eligibleUnresolved: 0,
        ignoredNoCtwa: 0,
        duplicate: 0,
        invalid: 0,
      },
    },
    channels: [
      {
        ...connectionView.channels[0],
        id: "channel_uazapi",
        connectionId: "connection_uazapi",
        connectedPhone: "provider_instance_secret_1",
        whatsappInstanceId: "wpp_1",
      },
    ],
  } satisfies InboundWebhookConnectionView;

  it("keeps the routed CTWA count and marks the unmeasured counters", () => {
    const html = renderPanel({ connections: [uazapiView] });

    expect(html).toContain("<span>CTWA roteado</span><strong>7</strong>");
    expect(html).toContain("7 roteados");
    for (const label of [
      "CTWA pendente",
      "Sem CTWA",
      "Duplicados",
      "Invalidos",
    ]) {
      expect(html).toContain(
        `<div class="inbound-counter unmeasured" data-measured="false"><span>${label}</span><strong>Nao medido</strong></div>`,
      );
      expect(html).not.toContain(`<span>${label}</span><strong>0</strong>`);
    }
    expect(html).toContain("nao sao medidos nesta conexao");
  });

  it("shows the bridged instance activity and its leads link", () => {
    const html = renderPanel({
      connections: [uazapiView],
      instanceActivities: {
        wpp_1: {
          state: "real",
          checkedAt: "2026-07-18T12:00:00.000Z",
          activity: {
            leads24h: 0,
            leads7d: 4,
            leadsTotal: 7,
            lastLeadAt: "2026-07-16T12:00:00.000Z",
            lastWebhookAt: "2026-07-17T11:00:00.000Z",
          },
        },
      },
    });

    expect(html).toContain('aria-label="Atividade da instancia WhatsApp"');
    expect(html).toContain("<dt>CTWA 24h</dt><dd>0</dd>");
    expect(html).toContain("Sem webhook recente ha mais de 24h");
    expect(html).toContain('href="/leads?whatsappInstanceId=wpp_1"');
    // The provider id stays behind the presentation mask, as before.
    expect(html).toMatch(
      /presentation-mask-value">provider_instance_secret_1<\/span><span class="presentation-mask-placeholder">Numero oculto/,
    );
  });

  it("renders missing activity as unavailable, not as zero or no webhook", () => {
    const html = renderPanel({ connections: [uazapiView] });

    expect(html).toContain("Atividade indisponivel");
    expect(html).not.toContain("Nenhum webhook registrado");
    expect(html).not.toContain("<dt>CTWA 24h</dt>");
  });

  it("leaves generic providers without activity or unmeasured counters", () => {
    const html = renderPanel({
      connections: [connectionView, uazapiView],
      instanceActivities: {},
    });
    const umbler = html.slice(0, html.indexOf("UAZAPI Vendas"));

    expect(umbler).toContain("<span>CTWA pendente</span><strong>5</strong>");
    expect(umbler).toContain("<span>Invalidos</span><strong>2</strong>");
    expect(umbler).not.toContain("Nao medido");
    expect(umbler).not.toContain("Atividade da instancia");
    expect(umbler).not.toContain("/leads?whatsappInstanceId");
    expect(html.match(/Atividade da instancia WhatsApp/g)).toHaveLength(1);
  });
});

function renderPanel({
  canManage = true,
  connections = [connectionView],
  instanceActivities,
}: {
  canManage?: boolean;
  connections?: InboundWebhookConnectionView[];
  instanceActivities?: WhatsappInstanceActivities;
} = {}) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return renderToStaticMarkup(
    createElement(InboundWebhookPanel, {
      capabilities,
      connections,
      providerRules: [],
      providerRulesEnabled: true,
      metaConfiguration,
      canManage,
      createAction: action,
      rotateSecretAction: action,
      setConnectionStatusAction: action,
      removeConnectionAction: action,
      setChannelStatusAction: action,
      saveRoutesAction: action,
      instanceActivities,
    }),
  );
}

function renderCreateForm({
  capabilities: panelCapabilities,
  createAction,
}: {
  capabilities: InboundWebhookCapabilitiesDto;
  createAction: Parameters<typeof InboundWebhookPanel>[0]["createAction"];
}) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return render(
    createElement(InboundWebhookPanel, {
      capabilities: panelCapabilities,
      connections: [],
      providerRules: [],
      providerRulesEnabled: true,
      metaConfiguration,
      canManage: true,
      createAction,
      rotateSecretAction: action,
      setConnectionStatusAction: action,
      removeConnectionAction: action,
      setChannelStatusAction: action,
      saveRoutesAction: action,
    }),
  );
}

function inboundRoute({
  id,
  metaBusinessConnectionId,
  metaReportingAccountId,
  metaConversionDestinationId,
}: {
  id: string;
  metaBusinessConnectionId: string;
  metaReportingAccountId: string;
  metaConversionDestinationId: string;
}) {
  return {
    id,
    channelId: "channel_1",
    metaBusinessConnectionId,
    metaReportingAccountId,
    metaConversionDestinationId,
    active: true,
    validationStatus: "valid",
    validationErrorCode: null,
    lastValidatedAt: "2026-07-17T19:25:00.000Z",
    createdAt: "2026-07-17T19:00:00.000Z",
    updatedAt: "2026-07-17T19:25:00.000Z",
  };
}

function metaBusinessConnection({
  id,
  businessManagerId,
  businessManagerName,
  defaultConversionDestinationId,
}: {
  id: string;
  businessManagerId: string;
  businessManagerName: string;
  defaultConversionDestinationId: string;
}) {
  return {
    id,
    workspaceId: "workspace_current",
    credentialId: "credential_current",
    businessManagerId,
    businessManagerName,
    status: "active" as const,
    defaultConversionDestinationId,
    reportingAccountCount: 1,
    activeReportingAccountCount: 1,
    lastValidatedAt: "2026-07-17T19:00:00.000Z",
    validationError: null,
    lastSyncedAt: "2026-07-17T19:00:00.000Z",
    createdAt: "2026-07-17T18:00:00.000Z",
    updatedAt: "2026-07-17T19:00:00.000Z",
  };
}

function metaDestination({
  id,
  label,
  ownerBusinessManagerId,
  pixelId,
  pixelName,
  pageId,
  pageName,
}: {
  id: string;
  label: string;
  ownerBusinessManagerId: string;
  pixelId: string;
  pixelName: string;
  pageId: string;
  pageName: string;
}) {
  return {
    id,
    workspaceId: "workspace_current",
    label,
    ownerBusinessManagerId,
    pixelId,
    pixelName,
    pageId,
    pageName,
    status: "configured" as const,
    lastValidatedAt: "2026-07-17T19:00:00.000Z",
    validationError: null,
  };
}

function metaReportingAccount({
  id,
  businessId,
  businessName,
  adAccountId,
  adAccountName,
  businessConnectionId,
  conversionDestinationId,
}: {
  id: string;
  businessId: string;
  businessName: string;
  adAccountId: string;
  adAccountName: string;
  businessConnectionId: string;
  conversionDestinationId: string;
}) {
  return {
    id,
    workspaceId: "workspace_current",
    businessId,
    businessName,
    adAccountId,
    adAccountName,
    currency: "BRL",
    timezoneName: "America/Sao_Paulo",
    businessConnectionId,
    conversionDestinationId,
    conversionDestinationIds: [conversionDestinationId],
    active: true,
    syncStatus: "synced" as const,
    lastSyncedAt: "2026-07-17T19:00:00.000Z",
    lastSyncSince: null,
    lastSyncUntil: null,
    syncError: null,
  };
}
