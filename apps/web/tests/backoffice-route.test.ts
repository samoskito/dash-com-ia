import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackofficePage from "../src/app/(backoffice)/backoffice/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffice route", () => {
  it("revalidates diagnostic pages after retrying from the list", () => {
    const source = readFileSync(
      "src/app/(backoffice)/backoffice/page.tsx",
      "utf8"
    );

    expect(source).toContain('revalidatePath("/backoffice")');
    expect(source).toContain(
      "revalidatePath(`/backoffice/diagnostics/${eventId}`)"
    );
  });

  it("revalidates backoffice after retrying a conversion event log", () => {
    const source = readFileSync(
      "src/app/(backoffice)/backoffice/page.tsx",
      "utf8"
    );

    expect(source).toContain("async function retryConversionEventLog");
    expect(source).toContain(
      "`/backoffice/diagnostics/conversions/${conversionEventLogId}/retry`"
    );
    expect(source).toContain('revalidatePath("/backoffice")');
  });

  it("renders split receivers returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "receiver_1",
              name: "Socio Operacional",
              walletId: "wallet_asaas_1",
              email: "socio@wpptrack.com",
              percentageBps: 2500,
              active: true,
              createdAt: "2026-07-02T03:00:00.000Z",
              updatedAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/split/receivers",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Socio Operacional");
    expect(html).toContain("wallet_asaas_1");
    expect(html).toContain("25.00%");
    expect(html).toContain("Novo recebedor");
    expect(html).toContain("Adicionar recebedor");
    expect(html).toContain("Salvar recebedor");
    expect(html).toContain('name="receiverId"');
    expect(html).toContain('name="percentage"');
  });

  it("renders diagnostic retry action when backend returns events", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "diag_1",
              workspaceId: "workspace_1",
              source: "uazapi",
              eventType: "conversion_trigger",
              severity: "error",
              status: "error",
              occurredAt: "2026-07-02T03:00:00.000Z",
              title: "Conversao nao enviada",
              message: "Regra por etiqueta sem contexto Meta",
              leadId: null,
              phoneHash: null,
              campaignId: null,
              adSetId: null,
              adId: null,
              jobId: null,
              errorCode: "MISSING_META_CONTEXT"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Conversao nao enviada");
    expect(html).toContain("Reprocessar");
    expect(html).toContain("/backoffice/diagnostics/diag_1");
    expect(html).toContain("diag_1");
  });

  it("renders webhook logs returned by the diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "webhook_1",
              workspaceId: "workspace_1",
              source: "uazapi",
              eventType: "message.received",
              externalEventId: "evt_1",
              status: "received",
              receivedAt: "2026-07-02T03:00:00.000Z",
              processedAt: null,
              leadId: "lead_1",
              phoneHash: "phone_hash_1",
              campaignId: "cmp_1",
              adSetId: null,
              adId: "ad_1",
              jobId: null,
              errorCode: null,
              errorMessage: null
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/webhooks?limit=10",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Webhooks recebidos");
    expect(html).toContain("message.received");
    expect(html).toContain("evt_1");
    expect(html).toContain("lead_1");
  });

  it("renders diagnostic job attempts returned by the diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "job_attempt_1",
              workspaceId: "workspace_1",
              queueName: "conversion-events",
              jobId: "bull_job_1",
              jobName: "send-conversion-event",
              attemptNumber: 2,
              status: "failed",
              scheduledAt: "2026-07-02T03:00:00.000Z",
              startedAt: "2026-07-02T03:01:00.000Z",
              finishedAt: "2026-07-02T03:01:10.000Z",
              nextRetryAt: "2026-07-02T03:05:00.000Z",
              source: "meta",
              relatedEntityType: "ConversionEventLog",
              relatedEntityId: "conversion_1",
              errorCode: "META_TIMEOUT",
              errorMessage: "Timeout Meta",
              createdAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        source: "meta",
        status: "failed",
        queueName: "conversion-events",
        jobName: "send-conversion-event",
        q: "timeout meta",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/jobs?limit=10&workspaceId=workspace_1&source=meta&status=failed&queueName=conversion-events&jobName=send-conversion-event&q=timeout+meta&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Jobs operacionais");
    expect(html).toContain("send-conversion-event");
    expect(html).toContain("META_TIMEOUT");
    expect(html).toContain("conversion_1");
  });

  it("renders integration logs returned by the diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "integration_1",
              workspaceId: "workspace_1",
              source: "meta",
              operation: "meta.campaigns.sync",
              status: "error",
              startedAt: "2026-07-02T03:00:00.000Z",
              finishedAt: "2026-07-02T03:00:02.000Z",
              durationMs: 2000,
              httpStatus: 500,
              providerRequestId: "fb_req_1",
              providerErrorCode: "META_RATE_LIMIT",
              providerErrorMessage: "Rate limit",
              leadId: null,
              campaignId: "cmp_1",
              adSetId: null,
              adId: null,
              jobId: "bull_job_1"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        source: "meta",
        status: "error",
        eventType: "meta.campaigns.sync",
        jobId: "bull_job_1",
        q: "rate limit",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/integrations?limit=10&workspaceId=workspace_1&source=meta&status=error&operation=meta.campaigns.sync&q=rate+limit&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&jobId=bull_job_1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Chamadas externas");
    expect(html).toContain("meta.campaigns.sync");
    expect(html).toContain("META_RATE_LIMIT");
    expect(html).toContain("fb_req_1");
  });

  it("renders conversion event logs returned by the diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "conversion_1",
              workspaceId: "workspace_1",
              leadId: "lead_1",
              phoneHash: "phone_hash_1",
              sourceTrigger: "keyword",
              eventName: "QualifiedLead",
              status: "error",
              pixelId: "pixel_1",
              metaAccountId: "act_1",
              campaignId: "cmp_1",
              adSetId: null,
              adId: "ad_1",
              attributionStatus: "matched",
              dedupeKey: "dedupe_1",
              sentAt: null,
              errorCode: "META_CONTEXT_MISSING",
              errorMessage: "Contexto Meta ausente",
              jobId: "bull_job_1",
              createdAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        status: "error",
        eventType: "QualifiedLead",
        sourceTrigger: "keyword",
        pixelId: "pixel_1",
        q: "context",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/conversions?limit=10&workspaceId=workspace_1&status=error&eventName=QualifiedLead&sourceTrigger=keyword&pixelId=pixel_1&q=context&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Eventos Pixel/CAPI");
    expect(html).toContain("QualifiedLead");
    expect(html).toContain("META_CONTEXT_MISSING");
    expect(html).toContain("pixel_1");
    expect(html).toContain('name="conversionEventLogId"');
    expect(html).toContain("Reprocessar Pixel");
  });

  it("renders audit logs returned by the diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "audit_1",
              workspaceId: "workspace_1",
              actorUserId: "user_1",
              actorType: "user",
              action: "auth.login_failed",
              targetType: "AuthIdentity",
              targetId: "identity_hash_1",
              reason: "Credenciais invalidas",
              sourceIp: "127.0.0.1",
              resultStatus: "failed",
              createdAt: "2026-07-02T03:00:00.000Z",
              beforeSummary: null,
              afterSummary: {
                userAgent: "Vitest"
              }
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        status: "failed",
        eventType: "auth.login_failed",
        actorType: "user",
        targetType: "AuthIdentity",
        q: "login",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/audit?limit=10&resultStatus=failed&workspaceId=workspace_1&action=auth.login_failed&actorType=user&targetType=AuthIdentity&q=login&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Auditoria operacional");
    expect(html).toContain("auth.login_failed");
    expect(html).toContain("Credenciais invalidas");
    expect(html).toContain("127.0.0.1");
  });

  it("renders workspace billing configuration with editable Asaas customer ids", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "workspace_1",
              name: "Comunidade NOD",
              slug: "comunidade-nod",
              asaasCustomerId: "cus_asaas_1",
              operationalStatus: "active",
              subscriptionStatus: "active",
              activeInstances: 2
            },
            {
              id: "workspace_2",
              name: "Clinica Norte",
              slug: "clinica-norte",
              asaasCustomerId: null,
              operationalStatus: "blocked",
              subscriptionStatus: "not_configured",
              activeInstances: 0
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/workspaces/billing",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("cus_asaas_1");
    expect(html).toContain("Clinica Norte");
    expect(html).toContain("Configurar customer");
    expect(html).toContain("active");
    expect(html).toContain("Operacao");
    expect(html).toContain("Bloquear");
    expect(html).toContain("Desbloquear");
    expect(html).toContain('name="operationalStatus"');
    expect(html).toContain("2 instancias");
    expect(html).toContain("not_configured");
  });

  it("renders payment charges returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "charge_1",
              workspaceId: "workspace_1",
              workspaceName: "Comunidade NOD",
              provider: "asaas",
              externalChargeId: "pay_asaas_1",
              status: "paid",
              amountCents: 12900,
              description: "Ativacao da instancia WhatsApp Comercial",
              checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1",
              dueAt: null,
              paidAt: "2026-07-02T12:00:00.000Z",
              createdAt: "2026-07-02T11:00:00.000Z",
              whatsappInstanceId: "wpp_1",
              whatsappInstanceName: "Comercial"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/billing/charges",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Cobrancas Asaas");
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("pay_asaas_1");
    expect(html).toContain("R$ 129,00");
    expect(html).toContain("Comercial");
    expect(html).toContain("paid");
  });

  it("renders subscription plans returned by the backoffice billing endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "plan_1",
              name: "Plano Growth",
              slug: "growth",
              pricePerWhatsappInstanceCents: 12900,
              active: true,
              createdAt: "2026-07-02T03:00:00.000Z",
              updatedAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/billing/plans",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Planos de assinatura");
    expect(html).toContain("Plano Growth");
    expect(html).toContain("growth");
    expect(html).toContain("R$ 129,00");
    expect(html).toContain("Novo plano");
    expect(html).toContain('name="planId"');
  });

  it("renders whatsapp instances returned by the backoffice endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "wpp_1",
              workspaceId: "workspace_1",
              workspaceName: "Comunidade NOD",
              name: "Comercial",
              provider: "uazapi",
              billingStatus: "active",
              providerInstanceId: "uazapi_1",
              createdAt: "2026-07-02T03:00:00.000Z",
              updatedAt: "2026-07-02T03:10:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/workspaces/whatsapp-instances",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Instancias WhatsApp");
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("Comercial");
    expect(html).toContain("uazapi_1");
    expect(html).toContain("active");
  });

  it("sends payment charge filters to the backoffice billing endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        chargeStatus: "failed",
        chargeWorkspaceId: "workspace_2"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/billing/charges?status=failed&workspaceId=workspace_2",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("failed");
    expect(html).toContain("workspace_2");
  });

  it("sends diagnostic filters to the backoffice diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        q: "currency",
        source: "meta",
        since: "2026-07-01",
        until: "2026-07-02",
        campaignId: "cmp_1",
        adId: "ad_1"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/events?limit=25&source=meta&q=currency&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&campaignId=cmp_1&adId=ad_1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/webhooks?limit=10&source=meta&q=currency&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&campaignId=cmp_1&adId=ad_1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("6 filtros ativos");
    expect(html).toContain("currency");
  });

  it("does not render demo backoffice numbers or fallback rows when APIs fail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar recebedores");
    expect(html).toContain("Nao foi possivel carregar eventos diagnosticos");
    expect(html).not.toContain("R$ 18.420");
    expect(html).not.toContain("94.2%");
    expect(html).not.toContain("128");
    expect(html).not.toContain("7 alertas");
    expect(html).not.toContain("Jobs online");
    expect(html).not.toContain("3 tokens a vencer");
    expect(html).not.toContain("Recebedor principal");
    expect(html).not.toContain("wallet_asaas_preview");
    expect(html).not.toContain("WhatsApp sessions");
    expect(html).not.toContain("Meta CAPI");
    expect(html).not.toContain("Billing split");
  });

  it("renders empty backoffice states without demo fallback rows", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhum recebedor configurado");
    expect(html).toContain("Nenhum evento diagnostico encontrado");
    expect(html).toContain("Customer Asaas ausente");
    expect(html).not.toContain("sem dados");
    expect(html).not.toContain("Recebedor principal");
    expect(html).not.toContain("wallet_asaas_preview");
    expect(html).not.toContain("WhatsApp sessions");
    expect(html).not.toContain("Meta CAPI");
    expect(html).not.toContain("Billing split");
  });
});
