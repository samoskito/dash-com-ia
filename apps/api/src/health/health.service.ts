import { Inject, Injectable, Optional } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";

type DependencyStatus = "ok" | "error";

type ReadinessPayload = {
  status: "ok" | "degraded";
  service: "wpptrack-api";
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
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
    private readonly injectedCreateRedisClient?: () => RedisLike
  ) {}

  getLiveness() {
    return {
      status: "ok",
      service: "wpptrack-api"
    };
  }

  async getReadiness(): Promise<ReadinessPayload> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis()
    ]);

    return {
      status: database === "ok" && redis === "ok" ? "ok" : "degraded",
      service: "wpptrack-api",
      dependencies: {
        database,
        redis
      }
    };
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
      connectTimeout: 1000
    });
  }
}
