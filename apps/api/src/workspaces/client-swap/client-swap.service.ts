import { createHash } from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type ClientSwapDto,
  type ClientSwapResult,
  clientSwapResultSchema,
} from "@wpptrack/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ClientSwapRateLimitService } from "./client-swap-rate-limit.service";

export const CLIENT_SWAP_COMPLETED_ACTION = "workspace.client_swapped";

/** Workspace-scoped Prisma delegates wiped in FK-safe order (children first). */
export const CLIENT_SWAP_PRE_CONNECTOR_DELEGATES = [
  "purchaseValueAdjustment",
  "purchaseReviewItem",
  "purchaseReview",
  "providerConversionRuleExecution",
  "providerConversionDecisionAudit",
  "providerConversionShadowComparison",
  "providerConversionRuleChannel",
  "providerConversionRuleEndpoint",
  "providerConversionRuleConfig",
  "conversionCatalogVariant",
  "conversionCatalogAttribute",
  "conversionCatalog",
  "inboundWebhookReplayItem",
  "inboundWebhookReplayBatch",
  "inboundWebhookProductionItem",
  "inboundWebhookEvent",
  "inboundWebhookDelivery",
  "inboundWebhookChannelRoute",
  "inboundWebhookChannel",
  "inboundWebhookConnection",
  "externalIngestionRecord",
] as const;

export const CLIENT_SWAP_CURSOR_DELEGATE = "externalSyncCursor";

export const CLIENT_SWAP_POST_CONNECTOR_DELEGATES = [
  "externalCapiCutover",
  "externalDataConnector",
  "metaAdDailyInsight",
  "metaAd",
  "metaAdSetDailyInsight",
  "metaAdSet",
  "metaCampaignDailyInsight",
  "metaCampaign",
  "metaAdDestinationAssignment",
  "metaReportingAccountDestination",
  "metaReportingAccount",
  "metaConversionDestination",
  "metaAssetSnapshot",
  "metaBusinessConnection",
  "metaCredential",
  "metaIntegration",
  "whatsappSeat",
  "whatsappInstanceActivation",
  "whatsappInstance",
  "conversionEventLog",
  "conversionRule",
  "funnelStageConfiguration",
  "lead",
  "diagnosticEvent",
  "webhookLog",
  "integrationLog",
  "jobAttempt",
] as const;

export const CLIENT_SWAP_WORKSPACE_DELEGATES = [
  ...CLIENT_SWAP_PRE_CONNECTOR_DELEGATES,
  ...CLIENT_SWAP_POST_CONNECTOR_DELEGATES,
] as const;

export const CLIENT_SWAP_WIPE_DELEGATES = [
  ...CLIENT_SWAP_PRE_CONNECTOR_DELEGATES,
  CLIENT_SWAP_CURSOR_DELEGATE,
  ...CLIENT_SWAP_POST_CONNECTOR_DELEGATES,
] as const;

type WorkspaceDelegateName =
  (typeof CLIENT_SWAP_WORKSPACE_DELEGATES)[number];

type WipeModel = {
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  count: (args: unknown) => Promise<number>;
};

export function hashClientSwapIdempotencyKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

@Injectable()
export class ClientSwapService {
  private readonly logger = new Logger(ClientSwapService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClientSwapRateLimitService)
    private readonly rateLimitService: ClientSwapRateLimitService,
  ) {}

  async swap(
    workspaceId: string,
    actorUserId: string,
    dto: ClientSwapDto,
    idempotencyKey?: string,
  ): Promise<ClientSwapResult> {
    if (dto.confirm !== true) {
      throw new BadRequestException("Payload invalido");
    }

    if (!idempotencyKey) {
      throw new ConflictException("Header Idempotency-Key é obrigatório");
    }

    const idempotencyKeyHash = hashClientSwapIdempotencyKey(idempotencyKey);

    this.logger.log("client_swap_started");

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`client-swap:${workspaceId}`}))`,
        );

        const replay = await this.findCompletedSwap(
          tx,
          workspaceId,
          idempotencyKeyHash,
        );
        if (replay) {
          return replay;
        }

        await this.rateLimitService.assertAllowed(workspaceId, tx);
        await this.validateSwap(tx, workspaceId, actorUserId);

        const connectorIds = (
          await tx.externalDataConnector.findMany({
            where: { workspaceId },
            select: { id: true },
          })
        ).map((connector) => connector.id);

        const wipedCounts = await this.wipeClientData(
          tx,
          workspaceId,
          connectorIds,
        );
        await this.assertWipeComplete(tx, workspaceId, connectorIds);
        await this.revokeMemberSessions(tx, workspaceId);

        const workspace = await this.renameWorkspaceIfRequested(
          tx,
          workspaceId,
          dto.newClientName,
        );

        await tx.auditLog.create({
          data: {
            workspaceId,
            actorUserId,
            actorType: "user",
            action: CLIENT_SWAP_COMPLETED_ACTION,
            targetType: "Workspace",
            targetId: workspaceId,
            reason:
              "Troca de cliente da agência: limpeza completa de dados do cliente anterior",
            resultStatus: "success",
            beforeSummary: { idempotencyKeyHash },
            afterSummary: {
              wipedCounts,
              workspace,
            },
          },
        });

        return {
          success: true as const,
          wipedCounts,
          workspace,
        };
      },
      { timeout: 120000 },
    );

    this.logger.log("client_swap_completed");
    return result;
  }

  private async findCompletedSwap(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    idempotencyKeyHash: string,
  ): Promise<ClientSwapResult | null> {
    const existing = await tx.auditLog.findFirst({
      where: {
        action: CLIENT_SWAP_COMPLETED_ACTION,
        targetId: workspaceId,
        resultStatus: "success",
        beforeSummary: {
          path: ["idempotencyKeyHash"],
          equals: idempotencyKeyHash,
        },
      },
      select: { afterSummary: true },
    });

    if (!existing) {
      return null;
    }

    return this.replayCompletedSwap(existing.afterSummary);
  }

  private replayCompletedSwap(afterSummary: unknown): ClientSwapResult {
    const summary =
      afterSummary && typeof afterSummary === "object"
        ? (afterSummary as {
            wipedCounts?: unknown;
            workspace?: unknown;
          })
        : {};

    const parsed = clientSwapResultSchema.safeParse({
      success: true,
      replayed: true,
      wipedCounts: summary.wipedCounts,
      workspace: summary.workspace,
    });

    if (!parsed.success) {
      throw new ConflictException("Idempotency-Key já utilizada");
    }

    return parsed.data;
  }

  private async validateSwap(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    actorUserId: string,
  ): Promise<void> {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: { where: { userId: actorUserId } },
        subscriptions: { where: { isCurrent: true } },
      },
    });

    if (!workspace) {
      throw new BadRequestException("Workspace não encontrado");
    }

    if (workspace.operationalStatus === "blocked") {
      throw new BadRequestException(
        "Workspace está bloqueado. Operação não permitida.",
      );
    }

    const membership = workspace.members[0];
    if (!membership || membership.role !== "owner") {
      throw new ForbiddenException(
        "Apenas o owner do workspace pode executar esta operação",
      );
    }

    const activeSubscription = workspace.subscriptions.find(
      (subscription) =>
        subscription.contractStatus === "active" && subscription.isCurrent,
    );
    if (!activeSubscription) {
      throw new BadRequestException("Workspace não possui assinatura ativa");
    }
  }

  private async wipeClientData(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    connectorIds: string[],
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const delegateName of CLIENT_SWAP_PRE_CONNECTOR_DELEGATES) {
      const result = await this.wipeDelegate(tx, delegateName).deleteMany({
        where: { workspaceId },
      });
      counts[delegateName] = result.count;
    }

    const cursorResult = await tx.externalSyncCursor.deleteMany({
      where: { connectorId: { in: connectorIds } },
    });
    counts[CLIENT_SWAP_CURSOR_DELEGATE] = cursorResult.count;

    for (const delegateName of CLIENT_SWAP_POST_CONNECTOR_DELEGATES) {
      const result = await this.wipeDelegate(tx, delegateName).deleteMany({
        where: { workspaceId },
      });
      counts[delegateName] = result.count;
    }

    return counts;
  }

  private async assertWipeComplete(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    connectorIds: string[],
  ): Promise<void> {
    for (const delegateName of CLIENT_SWAP_WORKSPACE_DELEGATES) {
      const remaining = await this.wipeDelegate(tx, delegateName).count({
        where: { workspaceId },
      });
      if (remaining !== 0) {
        this.logger.warn("client_swap_wipe_incomplete");
        throw new InternalServerErrorException(
          "Falha na limpeza do workspace",
        );
      }
    }

    const remainingCursors = await tx.externalSyncCursor.count({
      where: { connectorId: { in: connectorIds } },
    });
    if (remainingCursors !== 0) {
      this.logger.warn("client_swap_wipe_incomplete");
      throw new InternalServerErrorException("Falha na limpeza do workspace");
    }
  }

  private wipeDelegate(
    tx: Prisma.TransactionClient,
    name: WorkspaceDelegateName,
  ): WipeModel {
    const model = (tx as unknown as Record<string, WipeModel | undefined>)[
      name
    ];
    if (!model || typeof model.deleteMany !== "function") {
      throw new InternalServerErrorException("Falha na limpeza do workspace");
    }
    return model;
  }

  private async revokeMemberSessions(
    tx: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    const members = await tx.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });
    const userIds = members.map((member) => member.userId);

    if (userIds.length === 0) {
      return;
    }

    await tx.authSession.updateMany({
      where: {
        userId: { in: userIds },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async renameWorkspaceIfRequested(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    newClientName: string | undefined,
  ): Promise<ClientSwapResult["workspace"]> {
    if (newClientName) {
      const slug = await this.resolveWorkspaceSlug(
        tx,
        workspaceId,
        newClientName,
      );

      try {
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            name: newClientName,
            slug,
          },
        });
      } catch (error: unknown) {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException("Slug de workspace indisponivel");
        }
        throw error;
      }
    }

    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, operationalStatus: true },
    });

    if (!workspace) {
      throw new InternalServerErrorException("Falha na limpeza do workspace");
    }

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      operationalStatus: workspace.operationalStatus as "active" | "blocked",
    };
  }

  private async resolveWorkspaceSlug(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    workspaceName: string,
  ): Promise<string> {
    const baseSlug = this.slugify(workspaceName);
    let candidate = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await tx.workspace.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === workspaceId) {
        return candidate;
      }

      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);

    return slug || "workspace";
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
