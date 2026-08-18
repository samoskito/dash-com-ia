import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

const CLIENT_SWAP_COMPLETED_ACTION = "workspace.client_swapped";

@Injectable()
export class ClientSwapRateLimitService {
  async assertAllowed(
    workspaceId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentSwap = await tx.auditLog.findFirst({
      where: {
        workspaceId,
        action: CLIENT_SWAP_COMPLETED_ACTION,
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (recentSwap) {
      throw new HttpException(
        {
          statusCode: 429,
          code: "client_swap_rate_limited",
          message: "Limite de troca de cliente atingido.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
