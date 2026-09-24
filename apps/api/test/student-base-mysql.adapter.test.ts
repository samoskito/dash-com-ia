import type { PoolOptions } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  StudentBaseMysqlAdapter,
  type StudentBaseMysqlPool,
  type StudentBaseMysqlPoolFactory
} from "../src/licensing/student-base-mysql.adapter";

const configuredEnv = {
  LICENSE_CLAIM_MYSQL_HOST: "mysql.internal",
  LICENSE_CLAIM_MYSQL_PORT: "3307",
  LICENSE_CLAIM_MYSQL_DATABASE: "palm_up",
  LICENSE_CLAIM_MYSQL_USER: "student_reader",
  LICENSE_CLAIM_MYSQL_PASSWORD: "not-logged",
  LICENSE_CLAIM_MYSQL_SSL_MODE: "required",
  LICENSE_CLAIM_MYSQL_CONNECT_TIMEOUT_MS: "2500",
  LICENSE_CLAIM_MYSQL_QUERY_TIMEOUT_MS: "3000",
  LICENSE_CLAIM_MYSQL_POOL_SIZE: "2"
};

function createHarness(
  queryImplementation: (...args: unknown[]) => Promise<unknown>
) {
  const query = vi.fn(queryImplementation);
  const end = vi.fn(async () => undefined);
  const options: PoolOptions[] = [];
  const factory = vi.fn((input: PoolOptions): StudentBaseMysqlPool => {
    options.push(input);
    return {
      query: query as unknown as StudentBaseMysqlPool["query"],
      end
    };
  }) as unknown as StudentBaseMysqlPoolFactory;

  return { query, end, options, factory };
}

describe("student base MySQL adapter", () => {
  it("queries Transacoes with locked products and paid status, parameterized", async () => {
    const harness = createHarness(async () => [
      [
        {
          nome_comprador: "Ana",
          telefone_comprador: "11999998888",
          nome_produto: "Comunidade A Nova Ordem do Digital"
        }
      ],
      []
    ]);
    const adapter = new StudentBaseMysqlAdapter(
      harness.factory,
      configuredEnv
    );

    const result = await adapter.findEligiblePurchase("ana@x.com");

    expect(result).toEqual({
      kind: "eligible",
      buyerName: "Ana",
      phone: "11999998888",
      productName: "Comunidade A Nova Ordem do Digital"
    });
    const input = harness.query.mock.calls[0]?.[0] as {
      sql: string;
      values: unknown[];
      timeout: number;
    };
    expect(input.sql).toMatch(/^\s*SELECT\b/i);
    expect(input.sql).toContain("telefone_comprador");
    expect(input.sql).toMatch(/FROM Transacoes/);
    expect(input.sql).toMatch(/status = 'Paga'/);
    expect(input.sql).not.toContain("ana@x.com");
    expect(input.values).toEqual([
      "ana@x.com",
      "Rastracking100 - Sua estrutura 100% rastreada",
      "Comunidade A Nova Ordem do Digital"
    ]);
    expect(input.timeout).toBe(3000);
  });

  it("returns not_eligible for an empty result", async () => {
    const harness = createHarness(async () => [[], []]);
    const adapter = new StudentBaseMysqlAdapter(
      harness.factory,
      configuredEnv
    );

    await expect(adapter.findEligiblePurchase("ana@x.com")).resolves.toEqual({
      kind: "not_eligible"
    });
  });

  it("does not create a pool when required configuration is missing", async () => {
    const harness = createHarness(async () => [[], []]);
    const adapter = new StudentBaseMysqlAdapter(harness.factory, {
      ...configuredEnv,
      LICENSE_CLAIM_MYSQL_HOST: " "
    });

    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.findEligiblePurchase("ana@x.com")).resolves.toEqual({
      kind: "unavailable",
      reason: "not_configured"
    });
    expect(harness.factory).not.toHaveBeenCalled();
  });

  it.each([
    ["PROTOCOL_SEQUENCE_TIMEOUT", "timeout"],
    ["ECONNREFUSED", "connection"],
    ["ER_BAD_FIELD_ERROR", "query"]
  ] as const)("maps %s failures to %s", async (code, reason) => {
    const harness = createHarness(async () => {
      throw Object.assign(new Error("sensitive database detail"), { code });
    });
    const adapter = new StudentBaseMysqlAdapter(
      harness.factory,
      configuredEnv
    );

    await expect(adapter.findEligiblePurchase("ana@x.com")).resolves.toEqual({
      kind: "unavailable",
      reason
    });
  });

  it("creates one lazy pool with bounded read-only options", async () => {
    const harness = createHarness(async () => [[], []]);
    const adapter = new StudentBaseMysqlAdapter(
      harness.factory,
      configuredEnv
    );

    expect(adapter.isConfigured()).toBe(true);
    expect(harness.factory).not.toHaveBeenCalled();

    await adapter.findEligiblePurchase("first@x.com");
    await adapter.findEligiblePurchase("second@x.com");

    expect(harness.factory).toHaveBeenCalledTimes(1);
    expect(harness.options[0]).toMatchObject({
      host: "mysql.internal",
      port: 3307,
      database: "palm_up",
      user: "student_reader",
      password: "not-logged",
      connectionLimit: 2,
      connectTimeout: 2500,
      multipleStatements: false,
      dateStrings: true,
      ssl: { rejectUnauthorized: false }
    });
  });

  it("closes the pool on module destroy only when it was created", async () => {
    const unusedHarness = createHarness(async () => [[], []]);
    const unusedAdapter = new StudentBaseMysqlAdapter(
      unusedHarness.factory,
      configuredEnv
    );

    await unusedAdapter.onModuleDestroy();
    expect(unusedHarness.end).not.toHaveBeenCalled();

    const usedHarness = createHarness(async () => [[], []]);
    const usedAdapter = new StudentBaseMysqlAdapter(
      usedHarness.factory,
      configuredEnv
    );
    await usedAdapter.findEligiblePurchase("ana@x.com");
    await usedAdapter.onModuleDestroy();

    expect(usedHarness.end).toHaveBeenCalledTimes(1);
  });
});
