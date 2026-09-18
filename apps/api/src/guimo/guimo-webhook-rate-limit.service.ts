import { Injectable, NotFoundException } from "@nestjs/common";
import type { GuimoIntegration } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BAD_TOKEN_ATTEMPTS = 20;
const notFound = () => new NotFoundException("Webhook nao encontrado");

/**
 * Durable, integration-scoped protection for the public Guimo token path.
 * Every failure deliberately has the same public response as an unknown URL.
 */
@Injectable()
export class GuimoWebhookRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(integration: Pick<GuimoIntegration, "id">): Promise<void> {
    const cutoff = new Date(Date.now() - WINDOW_MS);
    try {
      const limited = await this.prisma.guimoWebhookRateLimit.findFirst({
        where: {
          integrationId: integration.id,
          windowStartedAt: { gte: cutoff },
          attempts: { gte: MAX_BAD_TOKEN_ATTEMPTS },
        },
        select: { id: true },
      });
      if (limited) throw notFound();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw notFound();
    }
  }

  async recordBadToken(integration: Pick<GuimoIntegration, "id" | "workspaceId">): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - WINDOW_MS);
    try {
      // Reset expired windows before the atomic increment. Concurrent attempts
      // can only over-count, which is safe for a brute-force guard.
      await this.prisma.guimoWebhookRateLimit.updateMany({
        where: { integrationId: integration.id, windowStartedAt: { lt: cutoff } },
        data: { windowStartedAt: now, attempts: 0 },
      });
      await this.prisma.guimoWebhookRateLimit.upsert({
        where: { integrationId: integration.id },
        create: {
          workspaceId: integration.workspaceId,
          integrationId: integration.id,
          windowStartedAt: now,
          attempts: 1,
        },
        update: { attempts: { increment: 1 } },
      });
    } catch {
      throw notFound();
    }
  }
}

export const GUIMO_BAD_TOKEN_RATE_LIMIT = { WINDOW_MS, MAX_BAD_TOKEN_ATTEMPTS };
