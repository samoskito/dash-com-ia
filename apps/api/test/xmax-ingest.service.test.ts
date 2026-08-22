import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { XmaxCredentialEncryptionService } from "../src/xmax/xmax-credential-encryption.service";
import { XmaxIngestService } from "../src/xmax/xmax-ingest.service";
import { XmaxProductionService } from "../src/xmax/xmax-production.service";
import { XmaxAdapter, XmaxAdapterError } from "../src/xmax/xmax.adapter";

const accountId = "xmax_acc_1";
const workspaceId = "workspace_1";
const secret = "super-secret-token";

function buildAccount(overrides: Record<string, unknown> = {}) {
  const crypto = new XmaxCredentialEncryptionService({
    META_TOKEN_ENCRYPTION_KEY: "test-meta-key-for-xmax",
  } as NodeJS.ProcessEnv);
  const encrypted = crypto.encrypt("api-key-value");
  return {
    id: accountId,
    workspaceId,
    displayName: "Conta 1",
    baseUrl: "https://xmax.example",
    queueId: "queue_1",
    ...encrypted,
    webhookSecretHash: crypto.hashWebhookSecret(secret),
    defaultCountryCode: "55",
    qualifiedLeadTagIds: ["55"],
    purchaseTagIds: ["56"],
    purchaseValueCents: 19900,
    purchaseCurrency: "BRL",
    status: "active",
    shadowMode: true,
    capiSendEnabled: false,
    ...overrides,
  };
}

describe("xmax ingest service (shadow)", () => {
  let prisma: any;
  let adapter: { getContact: ReturnType<typeof vi.fn> };
  let production: {
    isProductionEnabled: ReturnType<typeof vi.fn>;
    findPaidLead: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
  let service: XmaxIngestService;
  let credentials: XmaxCredentialEncryptionService;
  let shadowCreates: Array<Record<string, unknown>>;
  let dedupCreates: Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.META_TOKEN_ENCRYPTION_KEY = "test-meta-key-for-xmax";
    credentials = new XmaxCredentialEncryptionService(process.env);
    shadowCreates = [];
    dedupCreates = [];
    const account = buildAccount();

    prisma = {
      xmaxAccount: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.id === accountId && where.status === "active" ? account : null,
        ),
        update: vi.fn(async () => account),
      },
      xmaxShadowEvent: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          shadowCreates.push(data);
          return data;
        }),
      },
      xmaxContactEventDedup: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          dedupCreates.push(data);
          return data;
        }),
      },
      $transaction: vi.fn(async (fn: any) =>
        fn({
          xmaxContactEventDedup: {
            create: vi.fn(async ({ data }: any) => {
              dedupCreates.push(data);
              return data;
            }),
          },
          xmaxShadowEvent: {
            create: vi.fn(async ({ data }: any) => {
              shadowCreates.push(data);
              return data;
            }),
          },
        }),
      ),
    };

    adapter = {
      getContact: vi.fn(async () => ({
        contactId: "c1",
        number: "11988441020",
        name: "Lead X",
        tagIds: ["55"],
        raw: {},
      })),
    };

    production = {
      isProductionEnabled: vi.fn(() => false),
      findPaidLead: vi.fn(async () => ({ ok: false, reasonCode: "no_paid_lead" })),
      emit: vi.fn(async () => ({ attempted: false, reasonCode: "shadow_only" })),
    };

    service = new XmaxIngestService(
      prisma,
      credentials,
      adapter as unknown as XmaxAdapter,
      production as unknown as XmaxProductionService,
    );
  });

  function body(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload), "utf8");
  }

  it("returns uniform 404 for unknown account", async () => {
    prisma.xmaxAccount.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.ingest({
        accountId: "missing",
        token: secret,
        contentType: "application/json",
        providerAttempt: 1,
        rawBody: body({ Contact_Id: "1" }),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns uniform 404 for invalid secret", async () => {
    await expect(
      service.ingest({
        accountId,
        token: "wrong",
        contentType: "application/json",
        providerAttempt: 1,
        rawBody: body({ Contact_Id: "1" }),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("observes QualifiedLead in shadow mode without CAPI", async () => {
    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Nome: "Lead X" }),
    });

    expect(result).toMatchObject({
      status: "observed",
      eventName: "QualifiedLead",
      shadowMode: true,
      reasonCode: "shadow_observed",
    });
    expect(adapter.getContact).toHaveBeenCalledOnce();
    expect(production.emit).not.toHaveBeenCalled();
    expect(dedupCreates).toHaveLength(1);
    expect(shadowCreates.some((r) => r.status === "observed")).toBe(true);
  });

  it("calls production emit when cutover flags are on and paid lead exists", async () => {
    const live = buildAccount({ shadowMode: false, capiSendEnabled: true });
    prisma.xmaxAccount.findFirst.mockResolvedValueOnce(live);
    production.isProductionEnabled.mockReturnValue(true);
    production.findPaidLead.mockResolvedValueOnce({
      ok: true,
      lead: {
        id: "lead_1",
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        ctwaClid: "ctwa_1",
      },
    });
    production.emit.mockResolvedValueOnce({
      attempted: true,
      leadId: "lead_1",
      conversionEventLogId: "log_1",
      deliveryStatus: "ready_to_send",
      queued: true,
      reasonCode: "production_queued",
    });
    adapter.getContact.mockResolvedValueOnce({
      contactId: "c1",
      number: "11988441020",
      tagIds: ["56"],
      raw: {},
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.reasonCode).toBe("production_queued");
    expect(result.shadowMode).toBe(false);
    expect(production.findPaidLead).toHaveBeenCalled();
    expect(production.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        phoneNormalized: "5511988441020",
        contactId: "c1",
      }),
    );
    expect(dedupCreates).toHaveLength(1);
  });

  it("discards production tag without burning dedup when phone is not a paid lead", async () => {
    const live = buildAccount({ shadowMode: false, capiSendEnabled: true });
    prisma.xmaxAccount.findFirst.mockResolvedValueOnce(live);
    production.isProductionEnabled.mockReturnValue(true);
    production.findPaidLead.mockResolvedValueOnce({
      ok: false,
      reasonCode: "no_paid_lead",
    });
    adapter.getContact.mockResolvedValueOnce({
      contactId: "c_unpaid",
      number: "11988441020",
      tagIds: ["55"],
      raw: {},
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c_unpaid" }),
    });

    expect(result).toMatchObject({
      status: "discarded",
      reasonCode: "no_paid_lead",
      eventName: "QualifiedLead",
    });
    expect(production.emit).not.toHaveBeenCalled();
    expect(dedupCreates).toHaveLength(0);
    expect(shadowCreates.some((r) => r.status === "discarded")).toBe(true);
  });

  it("prioritizes Purchase when both tags are present", async () => {
    adapter.getContact.mockResolvedValueOnce({
      contactId: "c1",
      number: "5511988444100",
      tagIds: ["55", "56"],
      raw: {},
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: undefined,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.eventName).toBe("Purchase");
    expect(result.status).toBe("observed");
  });

  it("discards when getContact returns no mapped tags", async () => {
    adapter.getContact.mockResolvedValueOnce({
      contactId: "c1",
      number: "11999999999",
      tagIds: [],
      raw: {},
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.status).toBe("discarded");
    expect(result.reasonCode).toBe("no_mapped_tag");
    expect(dedupCreates).toHaveLength(0);
  });

  it("re-runs getContact on repeated identical webhook bodies (XMAX tag edits)", async () => {
    adapter.getContact
      .mockResolvedValueOnce({
        contactId: "c1",
        number: "11988441020",
        tagIds: ["55"],
        raw: {},
      })
      .mockResolvedValueOnce({
        contactId: "c1",
        number: "11988441020",
        tagIds: ["55", "56"],
        raw: {},
      });

    const payload = body({ Contact_Id: "c1", Nome: "Lead X" });

    const first = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: payload,
    });
    expect(first).toMatchObject({
      status: "observed",
      eventName: "QualifiedLead",
    });

    const second = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 2,
      rawBody: payload,
    });
    expect(second).toMatchObject({
      status: "observed",
      eventName: "Purchase",
    });
    expect(adapter.getContact).toHaveBeenCalledTimes(2);
  });

  it("returns semantic duplicate when contact+event already fired", async () => {
    prisma.xmaxContactEventDedup.findUnique.mockResolvedValueOnce({
      id: "d1",
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.status).toBe("duplicate");
    expect(result.reasonCode).toBe("semantic_duplicate");
  });

  it("marks failed when getContact times out", async () => {
    adapter.getContact.mockRejectedValueOnce(
      new XmaxAdapterError("xmax_timeout", "timeout"),
    );

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.status).toBe("failed");
    expect(result.reasonCode).toBe("xmax_timeout");
  });

  it("normalizes PY numbers with account defaultCountryCode", async () => {
    const pyAccount = buildAccount({ defaultCountryCode: "595" });
    prisma.xmaxAccount.findFirst.mockResolvedValueOnce(pyAccount);
    adapter.getContact.mockResolvedValueOnce({
      contactId: "c_py",
      number: "981234567",
      tagIds: ["55"],
      raw: {},
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c_py" }),
    });

    expect(result.status).toBe("observed");
    const observed = shadowCreates.find((r) => r.status === "observed");
    expect(observed?.phoneNormalized).toBe("595981234567");
  });
});

describe("xmax ingest service (global ingress)", () => {
  const ingressId = "xmax_ingress_1";
  const ingressSecret = "ingress-super-secret";
  const bentoAccountId = "xmax_acc_bento";
  const bentoWorkspaceId = "workspace_bento";
  const chapecoAccountId = "xmax_acc_chapeco";
  const chapecoWorkspaceId = "workspace_chapeco";

  let prisma: any;
  let adapter: { getContact: ReturnType<typeof vi.fn> };
  let production: {
    isProductionEnabled: ReturnType<typeof vi.fn>;
    findPaidLead: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
  let service: XmaxIngestService;
  let credentials: XmaxCredentialEncryptionService;
  let ingress: Record<string, unknown>;
  let bento: Record<string, unknown>;
  let chapeco: Record<string, unknown>;
  let shadowCreates: Array<Record<string, unknown>>;
  let dedupCreates: Array<Record<string, unknown>>;

  function buildAccountRow(
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    const crypto = new XmaxCredentialEncryptionService({
      META_TOKEN_ENCRYPTION_KEY: "test-meta-key-for-xmax",
    } as NodeJS.ProcessEnv);
    const encrypted = crypto.encrypt("api-key-value");
    return {
      displayName: "Conta",
      baseUrl: "https://xmax.example",
      ...encrypted,
      webhookSecretHash: crypto.hashWebhookSecret("unused-per-account-secret"),
      defaultCountryCode: "55",
      qualifiedLeadTagIds: ["55"],
      purchaseTagIds: ["56"],
      purchaseValueCents: 300000,
      purchaseCurrency: "BRL",
      status: "active",
      shadowMode: true,
      capiSendEnabled: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    process.env.META_TOKEN_ENCRYPTION_KEY = "test-meta-key-for-xmax";
    credentials = new XmaxCredentialEncryptionService(process.env);
    shadowCreates = [];
    dedupCreates = [];

    ingress = {
      id: ingressId,
      label: "Dr. Hernia",
      webhookSecretHash: credentials.hashWebhookSecret(ingressSecret),
      status: "active",
    };
    bento = buildAccountRow({
      id: bentoAccountId,
      workspaceId: bentoWorkspaceId,
      queueId: "12",
      queueName: "Bento Gonçalves",
      ingressId,
    });
    chapeco = buildAccountRow({
      id: chapecoAccountId,
      workspaceId: chapecoWorkspaceId,
      queueId: "13",
      queueName: "Chapecó",
      ingressId,
    });

    prisma = {
      xmaxIngress: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.id === ingressId && where.status === "active" ? ingress : null,
        ),
        update: vi.fn(async () => ingress),
      },
      xmaxAccount: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.status !== "active") return null;
          if (where.ingressId !== ingressId) return null;
          if (where.queueId === bento.queueId) return bento;
          if (where.queueId === chapeco.queueId) return chapeco;
          return null;
        }),
        // Backs the fallback fan-out: all active accounts for this ingress.
        findMany: vi.fn(async ({ where }: any) =>
          where.ingressId === ingressId && where.status === "active"
            ? [bento, chapeco]
            : [],
        ),
        update: vi.fn(async () => bento),
      },
      xmaxShadowEvent: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          shadowCreates.push(data);
          return data;
        }),
      },
      xmaxContactEventDedup: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          dedupCreates.push(data);
          return data;
        }),
      },
      $transaction: vi.fn(async (fn: any) =>
        fn({
          xmaxContactEventDedup: {
            create: vi.fn(async ({ data }: any) => {
              dedupCreates.push(data);
              return data;
            }),
          },
          xmaxShadowEvent: {
            create: vi.fn(async ({ data }: any) => {
              shadowCreates.push(data);
              return data;
            }),
          },
        }),
      ),
    };

    adapter = {
      getContact: vi.fn(async () => ({
        contactId: "c1",
        number: "11988441020",
        name: "Lead X",
        tagIds: ["55"],
        raw: {},
      })),
    };

    production = {
      isProductionEnabled: vi.fn(() => false),
      findPaidLead: vi.fn(async () => ({ ok: false, reasonCode: "no_paid_lead" })),
      emit: vi.fn(async () => ({ attempted: false, reasonCode: "shadow_only" })),
    };

    service = new XmaxIngestService(
      prisma,
      credentials,
      adapter as unknown as XmaxAdapter,
      production as unknown as XmaxProductionService,
    );
  });

  function body(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload), "utf8");
  }

  it("returns uniform 404 for unknown ingress", async () => {
    await expect(
      service.ingestGlobal({
        ingressId: "missing",
        token: ingressSecret,
        contentType: "application/json",
        providerAttempt: 1,
        rawBody: body({ Contact_Id: "c1", Queue_id: "12" }),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns uniform 404 for wrong ingress token", async () => {
    await expect(
      service.ingestGlobal({
        ingressId,
        token: "wrong",
        contentType: "application/json",
        providerAttempt: 1,
        rawBody: body({ Contact_Id: "c1", Queue_id: "12" }),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("falls back to a getContact fan-out when Queue_id is absent, then discards if no account claims the contact", async () => {
    adapter.getContact.mockRejectedValue(
      new XmaxAdapterError("xmax_http_error", "not found", 404),
    );

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result).toMatchObject({
      status: "discarded",
      reasonCode: "contact_not_found_in_tenant",
    });
    // Fallback tried every active account for the ingress (bounded, ~9 max).
    expect(adapter.getContact).toHaveBeenCalledTimes(2);
    expect(prisma.xmaxShadowEvent.create).not.toHaveBeenCalled();
    // lastWebhookAt still moves — auth+parse(contactId) succeeded even though
    // no account was ever resolved.
    expect(prisma.xmaxIngress.update).toHaveBeenCalledWith({
      where: { id: ingressId },
      data: { lastWebhookAt: expect.any(Date) },
    });
  });

  it("falls back to a getContact fan-out for an unknown Queue_id, then discards if no account claims the contact", async () => {
    adapter.getContact.mockRejectedValue(
      new XmaxAdapterError("xmax_http_error", "not found", 404),
    );

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Queue_id: "999" }),
    });

    expect(result).toMatchObject({
      status: "discarded",
      reasonCode: "queue_unresolved",
    });
    expect(adapter.getContact).toHaveBeenCalledTimes(2);
    expect(prisma.xmaxShadowEvent.create).not.toHaveBeenCalled();
  });

  it("resolves via fallback fan-out when Queue_id is absent and one account owns the contact", async () => {
    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === chapeco.queueId) {
        return { contactId: "c1", number: "11988441020", name: "Lead X", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates).toHaveLength(1);
    expect(shadowCreates[0]).toMatchObject({
      workspaceId: chapecoWorkspaceId,
      accountId: chapecoAccountId,
    });
  });

  it("resolves via fallback fan-out when Queue_id is wrong/unresolved and one account owns the contact", async () => {
    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === bento.queueId) {
        return { contactId: "c1", number: "11988441020", name: "Lead X", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Queue_id: "999" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates[0]).toMatchObject({
      workspaceId: bentoWorkspaceId,
      accountId: bentoAccountId,
    });
  });

  it("does not attempt the fallback fan-out when the fast path already resolves the account", async () => {
    await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Queue_id: "12" }),
    });

    // Only the one getContact call from processResolvedAccount's fast path.
    expect(adapter.getContact).toHaveBeenCalledTimes(1);
    expect(prisma.xmaxAccount.findMany).not.toHaveBeenCalled();
  });

  it("fans out with bounded concurrency but never stops early once a match is found (no Foz-steals-Farroupilha)", async () => {
    const foz = buildAccountRow({
      id: "acc_foz",
      workspaceId: "ws_foz",
      queueId: "10",
      ingressId,
    });
    const caxias = buildAccountRow({
      id: "acc_caxias",
      workspaceId: "ws_caxias",
      queueId: "11",
      ingressId,
    });
    const canoas = buildAccountRow({
      id: "acc_canoas",
      workspaceId: "ws_canoas",
      queueId: "16",
      ingressId,
    });
    // 4 accounts, concurrency 3: chapeco (in the first batch of 3) resolves
    // quickly, but that must NOT short-circuit the fan-out — the worker that
    // freed up must still pick up canoas (the 4th) before deciding.
    prisma.xmaxAccount.findMany = vi.fn(async ({ where }: any) =>
      where.ingressId === ingressId ? [foz, caxias, chapeco, canoas] : [],
    );

    const calledQueueIds: string[] = [];
    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      calledQueueIds.push(queueId);
      if (queueId === chapeco.queueId) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { contactId: "c1", number: "11988441020", name: "Lead X", tagIds: ["55"], raw: {} };
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates[0]).toMatchObject({ accountId: chapecoAccountId });
    // All 4 accounts were dispatched (bounded concurrency of 3, but no early
    // stop) — canoas WAS reached even though chapeco already had a hit.
    expect(calledQueueIds).toHaveLength(4);
    expect(calledQueueIds).toContain(canoas.queueId);
  });

  it("prefers the paid-lead workspace when multiple getContact hits claim the same contact (Farroupilha over Foz)", async () => {
    const foz = buildAccountRow({
      id: "acc_foz",
      workspaceId: "ws_foz",
      queueId: "10",
      ingressId,
    });
    const farroupilha = buildAccountRow({
      id: "acc_farroupilha",
      workspaceId: "ws_farroupilha",
      queueId: "42",
      ingressId,
    });
    prisma.xmaxAccount.findMany = vi.fn(async ({ where }: any) =>
      where.ingressId === ingressId ? [foz, farroupilha] : [],
    );

    // Both accounts claim the contact — the getContact fan-out sees two hits.
    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === "10") {
        return { contactId: "41837", number: "555181309849", tagIds: ["55"], raw: {} };
      }
      if (queueId === "42") {
        return { contactId: "41837", number: "555181309849", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });

    // Only Farroupilha's workspace already has a paid lead for this phone.
    production.findPaidLead.mockImplementation(async (workspaceId: string) =>
      workspaceId === "ws_farroupilha"
        ? {
            ok: true,
            lead: {
              id: "lead_farroupilha",
              adId: "ad_1",
              adSetId: "adset_1",
              campaignId: "cmp_1",
              ctwaClid: "ctwa_1",
            },
          }
        : { ok: false, reasonCode: "no_paid_lead" },
    );

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "41837" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates).toHaveLength(1);
    expect(shadowCreates[0]).toMatchObject({
      workspaceId: "ws_farroupilha",
      accountId: "acc_farroupilha",
    });
    expect(shadowCreates[0].rawSummary).toMatchObject({
      resolvePath: "fallback_getcontact",
      resolvedAccountId: "acc_farroupilha",
      resolvedQueueId: "42",
    });
  });

  it("resolves via the paid-lead-by-phone shortcut before ever calling getContact, when the webhook includes a phone hint", async () => {
    const farroupilha = buildAccountRow({
      id: "acc_farroupilha",
      workspaceId: "ws_farroupilha",
      queueId: "42",
      ingressId,
    });
    prisma.xmaxAccount.findMany = vi.fn(async ({ where }: any) =>
      where.ingressId === ingressId ? [bento, chapeco, farroupilha] : [],
    );

    production.findPaidLead.mockImplementation(async (workspaceId: string) =>
      workspaceId === "ws_farroupilha"
        ? {
            ok: true,
            lead: {
              id: "lead_farroupilha",
              adId: "ad_1",
              adSetId: "adset_1",
              campaignId: "cmp_1",
              ctwaClid: "ctwa_1",
            },
          }
        : { ok: false, reasonCode: "no_paid_lead" },
    );

    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === "42") {
        return { contactId: "41837", number: "555181309849", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "41837", Telefone: "555181309849" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates[0]).toMatchObject({
      workspaceId: "ws_farroupilha",
      accountId: "acc_farroupilha",
    });
    expect(shadowCreates[0].rawSummary).toMatchObject({
      resolvePath: "fallback_paid_lead",
      resolvedAccountId: "acc_farroupilha",
    });
    // The phone-based paid-lead lookup resolved the account without any
    // fan-out — only the one real getContact call from processResolvedAccount.
    expect(adapter.getContact).toHaveBeenCalledTimes(1);
  });

  it("discards ambiguous_queue_resolve when multiple getContact hits exist and neither paid lead nor payload Queue_id can break the tie", async () => {
    const foz = buildAccountRow({
      id: "acc_foz",
      workspaceId: "ws_foz",
      queueId: "10",
      ingressId,
    });
    const farroupilha = buildAccountRow({
      id: "acc_farroupilha",
      workspaceId: "ws_farroupilha",
      queueId: "42",
      ingressId,
    });
    prisma.xmaxAccount.findMany = vi.fn(async ({ where }: any) =>
      where.ingressId === ingressId ? [foz, farroupilha] : [],
    );

    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === "10" || queueId === "42") {
        return { contactId: "41837", number: "555181309849", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });
    // Neither workspace has a paid lead — no way to disambiguate.
    production.findPaidLead.mockResolvedValue({ ok: false, reasonCode: "no_paid_lead" });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "41837" }),
    });

    expect(result).toMatchObject({
      status: "discarded",
      reasonCode: "ambiguous_queue_resolve",
    });
    expect(shadowCreates).toHaveLength(0);
  });

  it("breaks a tie between two paid-lead hits using the payload Queue_id", async () => {
    const foz = buildAccountRow({
      id: "acc_foz",
      workspaceId: "ws_foz",
      queueId: "10",
      ingressId,
    });
    const farroupilha = buildAccountRow({
      id: "acc_farroupilha",
      workspaceId: "ws_farroupilha",
      queueId: "42",
      ingressId,
    });
    prisma.xmaxAccount.findMany = vi.fn(async ({ where }: any) =>
      where.ingressId === ingressId ? [foz, farroupilha] : [],
    );

    adapter.getContact.mockImplementation(async ({ queueId }: any) => {
      if (queueId === "10" || queueId === "42") {
        return { contactId: "41837", number: "555181309849", tagIds: ["55"], raw: {} };
      }
      throw new XmaxAdapterError("xmax_http_error", "not found", 404);
    });
    // Both workspaces (implausibly) have a paid lead for this phone — the
    // payload's Queue_id is the only remaining signal.
    production.findPaidLead.mockResolvedValue({
      ok: true,
      lead: { id: "lead_x", adId: "ad_1", adSetId: null, campaignId: null, ctwaClid: "ctwa_1" },
    });

    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      // Unresolved on its own (queue "999" isn't a real account) — but once
      // both hits are paid, the payload Queue_id "42" breaks the tie.
      rawBody: body({ Contact_Id: "41837", Queue_id: "42" }),
    });

    expect(result).toMatchObject({ status: "observed" });
    expect(shadowCreates[0]).toMatchObject({ accountId: "acc_farroupilha" });
  });

  it("routes Queue_id 12 to the Bento account and workspace", async () => {
    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Queue_id: "12", Queue_name: "Bento Gonçalves" }),
    });

    expect(result).toMatchObject({ status: "observed", eventName: "QualifiedLead" });
    expect(shadowCreates).toHaveLength(1);
    expect(shadowCreates[0]).toMatchObject({ workspaceId: bentoWorkspaceId, accountId: bentoAccountId });
    expect(prisma.xmaxIngress.update).toHaveBeenCalledWith({
      where: { id: ingressId },
      data: { lastWebhookAt: expect.any(Date) },
    });
  });

  it("never leaks an event into the neighbouring workspace for a different Queue_id", async () => {
    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c2", Queue_id: "13" }),
    });

    expect(result.status).toBe("observed");
    expect(shadowCreates).toHaveLength(1);
    expect(shadowCreates[0].workspaceId).toBe(chapecoWorkspaceId);
    expect(shadowCreates[0].workspaceId).not.toBe(bentoWorkspaceId);
    expect(shadowCreates[0].accountId).toBe(chapecoAccountId);
  });

  it("calls getContact with account.queueId from config, never the payload value", async () => {
    // account.queueId differs from the payload's Queue_id on purpose: routing
    // matched by (ingressId, queueId), but the outbound call must always use
    // the stored config value, never anything attacker/payload controlled.
    const spoofedQueueAccount = { ...bento, queueId: "12-config" };
    prisma.xmaxAccount.findFirst = vi.fn(async ({ where }: any) => {
      if (where.ingressId === ingressId && where.queueId === "12") {
        return spoofedQueueAccount;
      }
      return null;
    });

    await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Contact_Id: "c1", Queue_id: "12" }),
    });

    expect(adapter.getContact).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: "12-config" }),
    );
  });

  it("discards invalid JSON before any account is resolved, without touching lastWebhookAt", async () => {
    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: Buffer.from("not-json{", "utf8"),
    });

    expect(result).toMatchObject({ status: "discarded", reasonCode: "invalid_json" });
    expect(prisma.xmaxIngress.update).not.toHaveBeenCalled();
    expect(prisma.xmaxAccount.findFirst).not.toHaveBeenCalled();
  });

  it("discards a body with no contact id field, without touching lastWebhookAt", async () => {
    const result = await service.ingestGlobal({
      ingressId,
      token: ingressSecret,
      contentType: "application/json",
      providerAttempt: 1,
      rawBody: body({ Queue_id: "12" }),
    });

    expect(result).toMatchObject({
      status: "discarded",
      reasonCode: "missing_contact_id",
    });
    expect(prisma.xmaxIngress.update).not.toHaveBeenCalled();
    expect(prisma.xmaxAccount.findFirst).not.toHaveBeenCalled();
    expect(adapter.getContact).not.toHaveBeenCalled();
  });
});
