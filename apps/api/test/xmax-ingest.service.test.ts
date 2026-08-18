import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { XmaxCredentialEncryptionService } from "../src/xmax/xmax-credential-encryption.service";
import { XmaxIngestService } from "../src/xmax/xmax-ingest.service";
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
    status: "active",
    shadowMode: true,
    capiSendEnabled: false,
    ...overrides,
  };
}

describe("xmax ingest service (shadow)", () => {
  let prisma: any;
  let adapter: { getContact: ReturnType<typeof vi.fn> };
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

    service = new XmaxIngestService(
      prisma,
      credentials,
      adapter as unknown as XmaxAdapter,
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
    });
    expect(adapter.getContact).toHaveBeenCalledOnce();
    expect(dedupCreates).toHaveLength(1);
    expect(shadowCreates.some((r) => r.status === "observed")).toBe(true);
    expect(shadowCreates[shadowCreates.length - 1]).toMatchObject({
      eventName: "QualifiedLead",
      phoneNormalized: "5511988441020",
    });
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

  it("returns transport duplicate when ingressKey already exists", async () => {
    prisma.xmaxShadowEvent.findUnique.mockResolvedValueOnce({
      id: "s1",
      status: "observed",
      eventName: "QualifiedLead",
      reasonCode: "shadow_observed",
    });

    const result = await service.ingest({
      accountId,
      token: secret,
      contentType: "application/json",
      providerAttempt: 2,
      rawBody: body({ Contact_Id: "c1" }),
    });

    expect(result.status).toBe("duplicate");
    expect(adapter.getContact).not.toHaveBeenCalled();
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
