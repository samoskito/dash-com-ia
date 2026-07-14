import { describe, expect, it, vi } from "vitest";
import { HealthService } from "../src/health/health.service";

describe("health service", () => {
  it("reports readiness as ok when database and redis ping succeed", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ result: 1 }]),
    };
    const redis = {
      ping: vi.fn(async () => "PONG"),
      disconnect: vi.fn(),
    };
    const service = new HealthService(prisma as never, () => redis as never);

    await expect(service.getReadiness()).resolves.toEqual({
      status: "ok",
      service: "wpptrack-api",
      dependencies: {
        database: "ok",
        redis: "ok",
        email: "disabled",
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(redis.ping).toHaveBeenCalled();
    expect(redis.disconnect).toHaveBeenCalled();
  });

  it("reports degraded readiness when redis fails", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ result: 1 }]),
    };
    const redis = {
      ping: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
      disconnect: vi.fn(),
    };
    const service = new HealthService(prisma as never, () => redis as never);

    await expect(service.getReadiness()).resolves.toEqual({
      status: "degraded",
      service: "wpptrack-api",
      dependencies: {
        database: "ok",
        redis: "error",
        email: "disabled",
      },
    });
  });

  it("reports configured SMTP without connecting to the provider", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ result: 1 }]),
    };
    const redis = {
      ping: vi.fn(async () => "PONG"),
      disconnect: vi.fn(),
    };
    const emailHealth = {
      getConfigurationHealth: vi.fn(() => ({
        status: "ok" as const,
        provider: "smtp" as const,
        relay: {
          host: "smtp-relay.brevo.com",
          port: 587,
          security: "starttls" as const,
        },
        sender: "noreply@rastrack.app",
        replyTo: "suporte@rastrack.app",
      })),
    };
    const service = new HealthService(
      prisma as never,
      () => redis as never,
      emailHealth as never,
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: "ok",
      dependencies: {
        email: "ok",
      },
    });
    expect(emailHealth.getConfigurationHealth).toHaveBeenCalledOnce();
  });
});
