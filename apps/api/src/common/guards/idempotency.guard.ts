import { CanActivate, ExecutionContext, Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      throw new ConflictException('Header Idempotency-Key é obrigatório');
    }

    // Verificar se já existe uma chave usada recentemente (últimas 24h)
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        action: 'workspace.client_swapped',
        targetId: request.params.workspaceId,
        beforeSummary: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      select: { id: true, createdAt: true },
    });

    if (existing) {
      throw new ConflictException('Idempotency-Key já utilizada para este workspace');
    }

    // Armazenar a chave no request para uso posterior no service
    request.idempotencyKey = idempotencyKey;

    return true;
  }
}