import { Inject, Injectable, Optional } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { EmailHealthService } from "../email/email-health.service";

type DependencyStatus = "ok" | "error";
type EmailDependencyStatus = DependencyStatus | "disabled";

type ReadinessPayload = {
  status: "ok" | "degraded";
  service: "wpptrack-api";
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    email: EmailDependencyStatus;
  };
};

type RedisLike = {
  ping: () => Promise<string>;
  disconnect: () => void;
};

export const HEALTH_REDIS_CLIENT_FACTORY = "HEALTH_REDIS_CLIENT_FACTORY";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(HEALTH_REDIS_CLIENT_FACTORY)
    private readonly injectedCreateRedisClient?: () => RedisLike,
    @Optional()
    @Inject(EmailHealthService)
    private readonly emailHealth?: EmailHealthService,
  ) {}

  getLiveness() {
    return {
      status: "ok",
      service: "wpptrack-api",
    };
  }

  async getReadiness(): Promise<ReadinessPayload> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const email = this.checkEmailConfiguration();

    return {
      status:
        database === "ok" && redis === "ok" && email !== "error"
          ? "ok"
          : "degraded",
      service: "wpptrack-api",
      dependencies: {
        database,
        redis,
        email,
      },
    };
  }

  private checkEmailConfiguration(): EmailDependencyStatus {
    if (!this.emailHealth) {
      return "disabled";
    }

    try {
      return this.emailHealth.getConfigurationHealth().status;
    } catch {
      return "error";
    }
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const redis = this.createRedisClient();

    try {
      await redis.ping();
      return "ok";
    } catch {
      return "error";
    } finally {
      redis.disconnect();
    }
  }

  private createRedisClient(): RedisLike {
    if (this.injectedCreateRedisClient) {
      return this.injectedCreateRedisClient();
    }

    return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    });
  }
}
