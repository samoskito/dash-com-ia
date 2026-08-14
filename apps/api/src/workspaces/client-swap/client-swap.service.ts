import { Injectable, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClientSwapDto } from '@wpptrack/shared';
import { ClientSwapRateLimitService } from './client-swap-rate-limit.service';

@Injectable()
export class ClientSwapService {
  private readonly logger = new Logger(ClientSwapService.name);

  // Ordem de deleção respeitando FKs (filhos primeiro, pais depois)
  private readonly deletionOrder = [
    // Purchase reviews & adjustments
    'PurchaseValueAdjustment',
    'PurchaseReviewItem',
    'PurchaseReview',
    // Provider conversion rules
    'ProviderConversionRuleExecution',
    'ProviderConversionDecisionAudit',
    'ProviderConversionShadowComparison',
    'ProviderConversionRuleChannel',
    'ProviderConversionRuleEndpoint',
    'ProviderConversionRuleConfig',
    // Conversion catalogs
    'ConversionCatalogVariant',
    'ConversionCatalogAttribute',
    'ConversionCatalog',
    // Inbound webhooks
    'InboundWebhookReplayItem',
    'InboundWebhookReplayBatch',
    'InboundWebhookProductionItem',
    'InboundWebhookEvent',
    'InboundWebhookDelivery',
    'InboundWebhookChannelRoute',
    'InboundWebhookChannel',
    'InboundWebhookConnection',
    // External data connectors
    'ExternalIngestionRecord',
    'ExternalSyncCursor',
    'ExternalCapiCutover',
    'ExternalDataConnector',
    // Meta Ads
    'MetaAdDailyInsight',
    'MetaAd',
    'MetaAdSetDailyInsight',
    'MetaAdSet',
    'MetaCampaignDailyInsight',
    'MetaCampaign',
    'MetaAdDestinationAssignment',
    'MetaReportingAccountDestination',
    'MetaReportingAccount',
    'MetaConversionDestination',
    'MetaAssetSnapshot',
    'MetaBusinessConnection',
    'MetaCredential',
    'MetaIntegration',
    // WhatsApp
    'WhatsappSeat',
    'WhatsappInstanceActivation',
    'WhatsappInstance',
    // Conversions & rules
    'ConversionEventLog',
    'ConversionRule',
    'FunnelStageConfiguration',
    // Leads (por último, pois muitos outros referenciam)
    'Lead',
  ];

  // Modelos que devem ser MANTIDOS (apenas contados para auditoria)
  private readonly preservedModels = [
    'Workspace',
    'WorkspaceMember',
    'WorkspaceInvite',
    'WorkspaceSubscription',
    'WorkspaceBillingProfile',
    'SubscriptionPlan',
    'SplitReceiver',
    'SplitRule',
    'PaymentCharge',
    'BillingProviderEvent',
    'BillingContractAudit',
    'BillingInvoice',
    'WebhookLog',
    'IntegrationLog',
    'DiagnosticEvent',
    'JobAttempt',
    'AuditLog',
    'User',
    'AuthSession',
    'AuthActionToken',
    'MetaOAuthState',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: ClientSwapRateLimitService,
  ) {}

  async swap(
    workspaceId: string,
    actorUserId: string,
    dto: ClientSwapDto,
    idempotencyKey?: string,
  ): Promise<{
    success: true;
    wipedCounts: Record<string, number>;
    workspace: { id: string; name: string; slug: string; operationalStatus: 'active' | 'blocked' };
  }> {
    this.logger.log(`Starting client swap for workspace ${workspaceId} by user ${actorUserId}`);

    // 1. Validações de negócio
    await this.validateSwap(workspaceId, actorUserId);

    // 1.5 Rate limit: 1 swap por 24h
    await this.rateLimitService.checkAndRecord(workspaceId);

    // 2. Contar antes
    const beforeCounts = await this.countClientData(workspaceId);

    // 3. Executar deleção em transação
    const wipedCounts = await this.prisma.$transaction(
      async (tx) => {
        const counts: Record<string, number> = {};

        // Deletar na ordem correta
        for (const modelName of this.deletionOrder) {
          try {
            const result = await (tx as any)[modelName.toLowerCase()].deleteMany({
              where: { workspaceId },
            });
            counts[modelName] = result.count;
            if (result.count > 0) {
              this.logger.debug(`Deleted ${result.count} records from ${modelName}`);
            }
          } catch (error: unknown) {
            // Alguns modelos podem não existir no client Prisma ou ter nome diferente
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Could not delete from ${modelName}: ${message}`);
            counts[modelName] = 0;
          }
        }

        // Opcional: atualizar nome/slug do workspace se fornecido
        if (dto.newClientName) {
          await tx.workspace.update({
            where: { id: workspaceId },
            data: {
              name: dto.newClientName,
              slug: this.generateSlug(dto.newClientName),
            },
          });
        }

        return counts;
      },
      { timeout: 120000 }, // 2 minutos para transação grande
    );

    // 4. Contar depois (deve ser zero para modelos limpos)
    const afterCounts = await this.countClientData(workspaceId);

    // 5. Criar AuditLog
    await this.createAuditLog(workspaceId, actorUserId, beforeCounts, afterCounts, idempotencyKey);

    // 6. Invalidar sessões ativas no workspace (força re-login)
    await this.invalidateWorkspaceSessions(workspaceId);

    // 7. Buscar workspace atualizado
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, operationalStatus: true },
    });

    this.logger.log(`Client swap completed for workspace ${workspaceId}`);

    return {
      success: true,
      wipedCounts,
      workspace: {
        id: workspace!.id,
        name: workspace!.name,
        slug: workspace!.slug,
        operationalStatus: workspace!.operationalStatus as 'active' | 'blocked',
      },
    };
  }

  private async validateSwap(workspaceId: string, actorUserId: string): Promise<void> {
    // Verificar workspace existe
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: { where: { userId: actorUserId } },
        subscriptions: { where: { isCurrent: true } },
      },
    });

    if (!workspace) {
      throw new BadRequestException('Workspace não encontrado');
    }

    // Verificar se está blocked
    if (workspace.operationalStatus === 'blocked') {
      throw new BadRequestException('Workspace está bloqueado. Operação não permitida.');
    }

    // Verificar se actor é owner
    const membership = workspace.members[0];
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Apenas o owner do workspace pode executar esta operação');
    }

    // Verificar assinatura ativa
    const activeSubscription = workspace.subscriptions.find(
      (s) => s.contractStatus === 'active' && s.isCurrent,
    );
    if (!activeSubscription) {
      throw new BadRequestException('Workspace não possui assinatura ativa');
    }
  }

  private async countClientData(workspaceId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    // Contar modelos que serão limpos
    for (const modelName of this.deletionOrder) {
      try {
        const count = await (this.prisma as any)[modelName.toLowerCase()].count({
          where: { workspaceId },
        });
        counts[modelName] = count;
      } catch {
        counts[modelName] = 0;
      }
    }

    // Contar modelos preservados (para auditoria)
    for (const modelName of this.preservedModels) {
      try {
        const count = await (this.prisma as any)[modelName.toLowerCase()].count({
          where: { workspaceId },
        });
        counts[`preserved_${modelName}`] = count;
      } catch {
        counts[`preserved_${modelName}`] = 0;
      }
    }

    return counts;
  }

  private async createAuditLog(
    workspaceId: string,
    actorUserId: string,
    before: Record<string, number>,
    after: Record<string, number>,
    idempotencyKey?: string,
  ): Promise<void> {
    const beforeSummary = Object.fromEntries(
      Object.entries(before).filter(([k]) => !k.startsWith('preserved_')),
    );
    const afterSummary = Object.fromEntries(
      Object.entries(after).filter(([k]) => !k.startsWith('preserved_')),
    );

    const auditData: any = {
      workspaceId,
      actorUserId,
      actorType: 'user',
      action: 'workspace.client_swapped',
      targetType: 'Workspace',
      targetId: workspaceId,
      reason: 'Troca de cliente da agência: limpeza completa de dados do cliente anterior',
      resultStatus: 'success',
      beforeSummary,
      afterSummary,
    };

    if (idempotencyKey) {
      auditData.beforeSummary = {
        ...auditData.beforeSummary,
        idempotencyKey,
      };
    }

    await this.prisma.auditLog.create({
      data: auditData,
    });
  }

  private async invalidateWorkspaceSessions(workspaceId: string): Promise<void> {
    // Revogar sessões ativas neste workspace (força re-login)
    await this.prisma.authSession.updateMany({
      where: { activeWorkspaceId: workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Opcional: limpar cache da queue se houver jobs pendentes do workspace
    // BullMQ não tem API direta para limpar por workspace, mas jobs serão ignorados
    // pois os dados referenciados não existem mais
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 50);
  }
}