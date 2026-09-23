import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import {
  createPool,
  type Pool,
  type PoolOptions,
  type RowDataPacket,
} from "mysql2/promise";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";
import {
  LICENSE_CLAIM_ELIGIBLE_PRODUCTS,
  LICENSE_CLAIM_PAID_STATUS,
  LICENSE_CLAIM_TABLE,
} from "./licensing.constants";

export const STUDENT_BASE_MYSQL_POOL_FACTORY = Symbol(
  "STUDENT_BASE_MYSQL_POOL_FACTORY",
);

export type StudentBaseMysqlPool = Pick<Pool, "query" | "end">;
export type StudentBaseMysqlPoolFactory = (
  options: PoolOptions,
) => StudentBaseMysqlPool;

export type StudentBaseLookup =
  | {
      kind: "eligible";
      buyerName: string | null;
      phone: string | null;
      productName: string;
    }
  | { kind: "not_eligible" }
  | {
      kind: "unavailable";
      reason: "not_configured" | "timeout" | "connection" | "query";
    };

type StudentPurchaseRow = RowDataPacket & {
  nome_comprador: unknown;
  telefone_comprados: unknown;
  nome_produto: unknown;
};

const DEFAULT_MYSQL_PORT = 3306;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const DEFAULT_POOL_SIZE = 3;

@Injectable()
export class StudentBaseMysqlAdapter implements OnModuleDestroy {
  private pool: StudentBaseMysqlPool | null = null;

  constructor(
    @Optional()
    @Inject(STUDENT_BASE_MYSQL_POOL_FACTORY)
    private readonly poolFactory: StudentBaseMysqlPoolFactory = createPool,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.env.LICENSE_CLAIM_MYSQL_HOST?.trim() &&
        this.env.LICENSE_CLAIM_MYSQL_USER?.trim() &&
        this.env.LICENSE_CLAIM_MYSQL_DATABASE?.trim(),
    );
  }

  async findEligiblePurchase(
    normalizedEmail: string,
  ): Promise<StudentBaseLookup> {
    if (!this.isConfigured()) {
      return { kind: "unavailable", reason: "not_configured" };
    }

    try {
      const [rows] = await this.getPool().query<StudentPurchaseRow[]>({
        sql: `SELECT nome_comprador, telefone_comprados, nome_produto
                FROM ${LICENSE_CLAIM_TABLE}
               WHERE email_comprador = ?
                 AND status = '${LICENSE_CLAIM_PAID_STATUS}'
                 AND nome_produto IN (?, ?)
               LIMIT 1`,
        values: [normalizedEmail, ...LICENSE_CLAIM_ELIGIBLE_PRODUCTS],
        timeout: this.positiveIntegerEnv(
          "LICENSE_CLAIM_MYSQL_QUERY_TIMEOUT_MS",
          DEFAULT_QUERY_TIMEOUT_MS,
        ),
      });
      const row = rows[0];
      if (!row) {
        return { kind: "not_eligible" };
      }

      return {
        kind: "eligible",
        buyerName: this.optionalString(row.nome_comprador),
        phone: this.optionalString(row.telefone_comprados),
        productName: this.optionalString(row.nome_produto) ?? "",
      };
    } catch (error) {
      return { kind: "unavailable", reason: this.failureReason(error) };
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    if (pool) {
      await pool.end();
    }
  }

  private getPool(): StudentBaseMysqlPool {
    this.pool ??= this.poolFactory(this.poolOptions());
    return this.pool;
  }

  private poolOptions(): PoolOptions {
    const sslMode = this.env.LICENSE_CLAIM_MYSQL_SSL_MODE?.trim().toLowerCase();
    const sslCa = this.env.LICENSE_CLAIM_MYSQL_SSL_CA?.trim();

    return {
      host: this.env.LICENSE_CLAIM_MYSQL_HOST?.trim(),
      port: this.positiveIntegerEnv(
        "LICENSE_CLAIM_MYSQL_PORT",
        DEFAULT_MYSQL_PORT,
      ),
      database: this.env.LICENSE_CLAIM_MYSQL_DATABASE?.trim(),
      user: this.env.LICENSE_CLAIM_MYSQL_USER?.trim(),
      password: this.env.LICENSE_CLAIM_MYSQL_PASSWORD,
      connectionLimit: this.positiveIntegerEnv(
        "LICENSE_CLAIM_MYSQL_POOL_SIZE",
        DEFAULT_POOL_SIZE,
      ),
      connectTimeout: this.positiveIntegerEnv(
        "LICENSE_CLAIM_MYSQL_CONNECT_TIMEOUT_MS",
        DEFAULT_CONNECT_TIMEOUT_MS,
      ),
      multipleStatements: false,
      dateStrings: true,
      ssl:
        sslMode === "disabled"
          ? undefined
          : {
              rejectUnauthorized: sslMode === "verify_identity",
              ...(sslCa ? { ca: sslCa } : {}),
            },
    };
  }

  private positiveIntegerEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(this.env[name] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return String(value).trim() || null;
  }

  private failureReason(
    error: unknown,
  ): "timeout" | "connection" | "query" {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";

    if (
      code === "PROTOCOL_SEQUENCE_TIMEOUT" ||
      code === "ETIMEDOUT" ||
      code === "PROTOCOL_CONNECTION_LOST"
    ) {
      return "timeout";
    }
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "EHOSTUNREACH" ||
      code === "ER_ACCESS_DENIED_ERROR"
    ) {
      return "connection";
    }
    return "query";
  }
}
