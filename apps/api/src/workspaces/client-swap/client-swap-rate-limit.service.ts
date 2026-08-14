import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ClientSwapRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async checkAndRecord(workspaceId: string): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentSwap = await this.prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: 'workspace.client_swapped',
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    if (recentSwap) {
      const nextAllowedAt = new Date(recentSwap.createdAt.getTime() + 24 * 60 * 60 * 1000);
      throw new HttpException(
        {
          statusCode: 429,
          code: 'client_swap_rate_limited',
          message: `Limite de troca de cliente atingido. Próximo swap permitido em ${nextAllowedAt.toISOString()}.`,
          retryAfter: nextAllowedAt.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}