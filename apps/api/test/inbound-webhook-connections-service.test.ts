import { createHash } from "node:crypto";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundWebhookConnectionsService } from "../src/inbound-webhooks/inbound-webhook-connections.service";

type TestParserRelease = {
  id: string;
  provider: "umbler" | "gupshup";
  version: string;
  status: "observation_only";
  certifiedByUserId: null;
  certifiedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

type TestConnection = {
  id: string;
  workspaceId: string;
  provider: "umbler" | "gupshup";
  displayName: string;
  parserReleaseId: string;
  secretHash: string | null;
  status: "observation" | "production" | "paused";
  createdByUserId: string | null;
  lastDeliveryAt: Date | null;
  lastSuccessfulParseAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parserRelease: TestParserRelease;
};

function enabledEnvironment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"),
  };
}

function createHarness() {
  const now = new Date("2026-07-17T18:30:00.000Z");
  const parserReleases: TestParserRelease[] = [
    {
      id: "inbound_parser_umbler_v1",
      provider: "umbler",
      version: "v1",
      status: "observation_only",
      certifiedByUserId: null,
      certifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "inbound_parser_gupshup_v1",
      provider: "gupshup",
      version: "v1",
      status: "observation_only",
      certifiedByUserId: null,
      certifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const connections = new Map<string, TestConnection>();
  const audits: Array<Record<string, unknown>> = [];
  let sequence = 0;
  let failNextMutationClaim = false;

  const inboundWebhookConnection = {
    findMany: vi.fn(async ({ where }) =>
      [...connections.values()]
        .filter(
          (connection) =>
            connection.workspaceId === where.workspaceId &&
            connection.removedAt === null,
        )
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        ),
    ),
    findFirst: vi.fn(async ({ where }) => {
      const connection = connections.get(where.id);

      return connection &&
        connection.workspaceId === where.workspaceId &&
        connection.removedAt === null
        ? connection
        : null;
    }),
    create: vi.fn(async ({ data }) => {
      sequence += 1;
      const createdAt = new Date(now.getTime() + sequence * 1_000);
      const parserRelease = parserReleases.find(
        (release) => release.id === data.parserReleaseId,
      );

      if (!parserRelease) {
        throw new Error("parser release missing");
      }

      const connection: TestConnection = {
        id: `inbound_connection_${sequence}`,
        workspaceId: data.workspaceId,
        provider: data.provider,
        displayName: data.displayName,
        parserReleaseId: data.parserReleaseId,
        secretHash: data.secretHash,
        status: data.status,
        createdByUserId: data.createdByUserId,
        lastDeliveryAt: null,
        lastSuccessfulParseAt: null,
        removedAt: null,
        createdAt,
        updatedAt: createdAt,
        parserRelease,
      };
      connections.set(connection.id, connection);

      return connection;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      if (failNextMutationClaim) {
        failNextMutationClaim = false;
        return { count: 0 };
      }

      const current = connections.get(where.id);

      if (
        !current ||
        current.workspaceId !== where.workspaceId ||
        current.removedAt !== null ||
        current.updatedAt.getTime() !== where.updatedAt.getTime()
      ) {
        return { count: 0 };
      }

      const updated: TestConnection = {
        ...current,
        ...data,
        updatedAt: new Date(current.updatedAt.getTime() + 1_000),
      };
      connections.set(updated.id, updated);

      return { count: 1 };
    }),
  };
  const prisma = {
    inboundWebhookParserRelease: {
      findFirst: vi.fn(
        async ({ where }) =>
          parserReleases.find(
            (release) =>
              where.provider === release.provider &&
              where.version === release.version,
          ) ?? null,
      ),
      findMany: vi.fn(async () => parserReleases),
    },
    inboundWebhookConnection,
    auditLog: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (operation) => {
      const connectionSnapshot = [...connections.entries()].map(
        ([id, connection]) => [id, { ...connection }] as const,
      );
      const auditLength = audits.length;

      try {
        return await operation(prisma);
      } catch (error) {
        connections.clear();
        for (const [id, connection] of connectionSnapshot) {
          connections.set(id, connection);
        }
        audits.splice(auditLength);
        throw error;
      }
    }),
  };

  const service = new InboundWebhookConnectionsService(
    prisma as unknown as PrismaService,
    enabledEnvironment(),
  );

  return {
    audits,
    connections,
    prisma,
    service,
    failNextMutationClaim() {
      failNextMutationClaim = true;
    },
  };
}

describe("inbound webhook connections service", () => {
  it("creates a protected Umbler connection and returns the secret once", async () => {
    const harness = createHarness();

    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Comercial",
      },
      "user_1",
    );

    expect(Buffer.from(created.secret, "base64url")).toHaveLength(32);
    expect(created.connection.status).toBe("observation");
    expect(created.connection.parserVersion).toBe("v1");
    expect(created.connection.parserReleaseStatus).toBe("observation_only");

    const url = new URL(created.webhookUrl);
    expect(url.origin).toBe("http://localhost:3333");
    expect(url.pathname).toBe(`/webhooks/inbound/${created.connection.id}`);
    expect(url.searchParams.get("token")).toBe(created.secret);

    const persisted = harness.connections.get(created.connection.id);
    const expectedHash = createHash("sha256")
      .update(created.secret, "utf8")
      .digest("hex");
    expect(persisted?.secretHash).toBe(expectedHash);
    expect(JSON.stringify(persisted)).not.toContain(created.secret);

    const listed = await harness.service.listConnections("workspace_1");
    const detailed = await harness.service.getConnection(
      "workspace_1",
      created.connection.id,
    );
    const publicPayload = JSON.stringify({ listed, detailed });
    expect(publicPayload).not.toContain(created.secret);
    expect(publicPayload).not.toContain(expectedHash);
    expect(publicPayload).not.toContain("secretHash");
    expect(publicPayload).not.toContain("webhookUrl");

    const auditPayload = JSON.stringify(harness.audits);
    expect(auditPayload).not.toContain(created.secret);
    expect(auditPayload).not.toContain(expectedHash);
    expect(auditPayload).not.toContain("token=");
    expect(harness.audits[0]).toMatchObject({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      action: "inbound_webhook.connection_created",
      targetType: "InboundWebhookConnection",
    });
  });

  it("advertises and creates Gupshup only as an observation connection", async () => {
    const harness = createHarness();
    const capabilities = await harness.service.getCapabilities();

    expect(capabilities.providers).toEqual([
      {
        provider: "umbler",
        parserVersion: "v1",
        parserReleaseStatus: "observation_only",
        creationEnabled: true,
      },
      {
        provider: "gupshup",
        parserVersion: "v1",
        parserReleaseStatus: "observation_only",
        creationEnabled: true,
      },
    ]);

    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "gupshup",
        displayName: "Gupshup Cliente",
      },
      "user_1",
    );

    expect(created.connection).toMatchObject({
      provider: "gupshup",
      parserVersion: "v1",
      parserReleaseStatus: "observation_only",
      status: "observation",
    });
    expect(new URL(created.webhookUrl).searchParams.get("token")).toBe(
      created.secret,
    );
  });

  it("rotates the hash and returns a single new URL without exposing it later", async () => {
    const harness = createHarness();
    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Vendas",
      },
      "user_1",
    );
    const previousHash = harness.connections.get(
      created.connection.id,
    )?.secretHash;

    const rotated = await harness.service.rotateSecret(
      "workspace_1",
      created.connection.id,
      "user_2",
    );
    const currentHash = harness.connections.get(
      created.connection.id,
    )?.secretHash;

    expect(rotated.secret).not.toBe(created.secret);
    expect(Buffer.from(rotated.secret, "base64url")).toHaveLength(32);
    expect(currentHash).not.toBe(previousHash);
    expect(currentHash).toBe(
      createHash("sha256").update(rotated.secret, "utf8").digest("hex"),
    );
    expect(new URL(rotated.webhookUrl).searchParams.get("token")).toBe(
      rotated.secret,
    );
    expect(
      JSON.stringify(await harness.service.listConnections("workspace_1")),
    ).not.toContain(rotated.secret);
    expect(JSON.stringify(harness.audits)).not.toContain(rotated.secret);
    expect(harness.audits.at(-1)).toMatchObject({
      action: "inbound_webhook.secret_rotated",
      actorUserId: "user_2",
    });
  });

  it("pauses, resumes and tombstones a connection without deleting observations", async () => {
    const harness = createHarness();
    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Atendimento",
      },
      "user_1",
    );
    const initialHash = harness.connections.get(
      created.connection.id,
    )?.secretHash;

    const paused = await harness.service.updateStatus(
      "workspace_1",
      created.connection.id,
      { status: "paused" },
      "user_1",
    );
    expect(paused.status).toBe("paused");
    expect(harness.connections.get(created.connection.id)?.secretHash).toBe(
      initialHash,
    );

    const resumed = await harness.service.updateStatus(
      "workspace_1",
      created.connection.id,
      { status: "observation" },
      "user_1",
    );
    expect(resumed.status).toBe("observation");

    await harness.service.removeConnection(
      "workspace_1",
      created.connection.id,
      "user_1",
    );

    const tombstone = harness.connections.get(created.connection.id);
    expect(tombstone?.status).toBe("paused");
    expect(tombstone?.secretHash).toBeNull();
    expect(tombstone?.removedAt).toBeInstanceOf(Date);
    expect(await harness.service.listConnections("workspace_1")).toEqual([]);
    await expect(
      harness.service.getConnection("workspace_1", created.connection.id),
    ).rejects.toMatchObject({
      message: "Conexao de webhook nao encontrada",
    });
    expect(harness.audits.map((audit) => audit.action)).toEqual([
      "inbound_webhook.connection_created",
      "inbound_webhook.connection_paused",
      "inbound_webhook.connection_resumed",
      "inbound_webhook.connection_removed",
    ]);
  });

  it("does not reveal whether an ID belongs to another workspace", async () => {
    const harness = createHarness();
    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Restrita",
      },
      "user_1",
    );

    const capture = async (connectionId: string) => {
      try {
        await harness.service.getConnection("workspace_2", connectionId);
        throw new Error("expected lookup to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        return {
          message: (error as NotFoundException).message,
          status: (error as NotFoundException).getStatus(),
        };
      }
    };

    expect(await capture(created.connection.id)).toEqual(
      await capture("missing_connection"),
    );
    await expect(
      harness.service.rotateSecret(
        "workspace_2",
        created.connection.id,
        "user_2",
      ),
    ).rejects.toMatchObject({
      message: "Conexao de webhook nao encontrada",
    });
  });

  it("blocks creation when disabled and production before certification", async () => {
    const harness = createHarness();
    const disabledService = new InboundWebhookConnectionsService(
      harness.prisma as unknown as PrismaService,
      {
        INBOUND_WEBHOOKS_ENABLED: "false",
      },
    );

    await expect(
      disabledService.createConnection(
        "workspace_1",
        {
          provider: "umbler",
          displayName: "Umbler Bloqueada",
        },
        "user_1",
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(harness.connections.size).toBe(0);

    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Observacao",
      },
      "user_1",
    );
    await expect(
      harness.service.updateStatus(
        "workspace_1",
        created.connection.id,
        { status: "production" } as never,
        "user_1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.connections.get(created.connection.id)?.status).toBe(
      "observation",
    );
  });

  it("does not return a secret when a concurrent mutation wins", async () => {
    const harness = createHarness();
    const created = await harness.service.createConnection(
      "workspace_1",
      {
        provider: "umbler",
        displayName: "Umbler Concorrente",
      },
      "user_1",
    );
    const previousHash = harness.connections.get(
      created.connection.id,
    )?.secretHash;
    harness.failNextMutationClaim();

    await expect(
      harness.service.rotateSecret(
        "workspace_1",
        created.connection.id,
        "user_2",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "A conexao foi alterada por outra operacao; tente novamente",
    });

    expect(harness.connections.get(created.connection.id)?.secretHash).toBe(
      previousHash,
    );
    expect(harness.audits).toHaveLength(1);
  });

  it("rolls back connection persistence when its audit cannot be stored", async () => {
    const harness = createHarness();
    harness.prisma.auditLog.create.mockRejectedValueOnce(
      new Error("audit unavailable"),
    );

    await expect(
      harness.service.createConnection(
        "workspace_1",
        {
          provider: "umbler",
          displayName: "Umbler Sem Auditoria",
        },
        "user_1",
      ),
    ).rejects.toThrow("audit unavailable");

    expect(harness.connections.size).toBe(0);
    expect(harness.audits).toEqual([]);
  });
});
