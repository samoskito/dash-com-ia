import type { ConnectionOptions } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  ExternalMysqlAdapter,
  type ExternalMysqlConnection,
  type ExternalMysqlConnectionFactory
} from "../src/external-data/external-mysql.adapter";

const credentials = {
  host: "mysql.internal",
  port: 3306,
  database: "tracking",
  username: "reader",
  password: "secret"
};

function adapterWithQuery(
  query: ExternalMysqlConnection["query"]
): { adapter: ExternalMysqlAdapter; options: ConnectionOptions[] } {
  const options: ConnectionOptions[] = [];
  const factory: ExternalMysqlConnectionFactory = async (input) => {
    options.push(input);
    return {
      query,
      end: vi.fn(async () => undefined)
    };
  };

  return {
    adapter: new ExternalMysqlAdapter(factory, {
      WPPTRACK_EXTERNAL_MYSQL_CONNECT_TIMEOUT_MS: "2500",
      WPPTRACK_EXTERNAL_MYSQL_QUERY_TIMEOUT_MS: "3000"
    }),
    options
  };
}

describe("external MySQL adapter", () => {
  it("validates both fixed safe views and closes the connection", async () => {
    const query = vi.fn(async (input: { sql: string }) => {
      if (input.sql.includes("information_schema.VIEWS")) {
        return [
          [
            { TABLE_NAME: "vw_wpptrack_leads" },
            { TABLE_NAME: "vw_wpptrack_events" }
          ],
          []
        ];
      }

      return [[{ ok: 1 }], []];
    }) as unknown as ExternalMysqlConnection["query"];
    const { adapter, options } = adapterWithQuery(query);

    const result = await adapter.testConnection(credentials, "required");

    expect(result.ok).toBe(true);
    expect(result.leadsViewAvailable).toBe(true);
    expect(result.eventsViewAvailable).toBe(true);
    expect(options[0]).toMatchObject({
      host: credentials.host,
      database: credentials.database,
      connectTimeout: 2500,
      multipleStatements: false,
      ssl: { rejectUnauthorized: false }
    });
  });

  it("reports missing views without exposing connection values", async () => {
    const query = vi.fn(async (input: { sql: string }) => {
      return input.sql.includes("information_schema.VIEWS")
        ? [[{ TABLE_NAME: "vw_wpptrack_leads" }], []]
        : [[{ ok: 1 }], []];
    }) as unknown as ExternalMysqlConnection["query"];
    const { adapter } = adapterWithQuery(query);

    const result = await adapter.testConnection(credentials, "disabled");

    expect(result).toMatchObject({
      ok: false,
      errorCode: "RequiredViewsMissing",
      leadsViewAvailable: true,
      eventsViewAvailable: false
    });
    expect(JSON.stringify(result)).not.toContain(credentials.password);
  });

  it("maps incremental event rows and keeps the query bounded", async () => {
    const query = vi.fn(async () => [
      [
        {
          externalRowId: "42",
          dedupeKey: "kinbox:purchase:lead_1:2026-07-11",
          provider: "kinbox",
          eventType: "purchase",
          sourceEventName: "Venda Fechada",
          externalEventId: null,
          externalLeadId: "lead_1",
          transactionId: null,
          phone: "5511999999999",
          occurredAt: "2026-07-11 12:00:00.000",
          eventLocalDate: "2026-07-11",
          adId: "ad_1",
          adSetId: null,
          campaignId: null,
          ctwaClid: "clid_1",
          sourceUrl: null,
          valueCents: null,
          currency: "BRL",
          valueSource: null,
          duplicateCount: 0,
          updatedAt: "2026-07-11 12:00:01.000"
        }
      ],
      []
    ]) as unknown as ExternalMysqlConnection["query"];
    const { adapter } = adapterWithQuery(query);

    const rows = await adapter.readEventsPage(
      credentials,
      "required",
      { lastUpdatedAt: null, lastExternalId: null },
      5000
    );

    expect(rows[0]).toMatchObject({
      externalRowId: "42",
      eventType: "purchase",
      externalLeadId: "lead_1",
      valueCents: null
    });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining([1000]),
        timeout: 3000
      })
    );
  });

  it("sanitizes connection errors", async () => {
    const factory: ExternalMysqlConnectionFactory = async () => {
      throw Object.assign(new Error("Access denied for reader@mysql.internal"), {
        code: "ER_ACCESS_DENIED_ERROR"
      });
    };
    const adapter = new ExternalMysqlAdapter(factory, {});

    const result = await adapter.testConnection(credentials, "required");

    expect(result).toMatchObject({
      ok: false,
      errorCode: "ER_ACCESS_DENIED_ERROR",
      message: "Acesso negado pelo MySQL"
    });
    expect(JSON.stringify(result)).not.toContain("mysql.internal");
  });
});
