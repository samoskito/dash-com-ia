import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, type WorkspaceSubscription } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  INDIVIDUAL_NUMBER_PRICE_CENTS,
  addDays,
} from "./package-billing.policy";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { BillingTrialReminderService } from "./billing-trial-reminder.service";

type TransactionClient = Prisma.TransactionClient;

export type TrialAutoconvertResult = {
  notices: number;
  draftsCreated: number;
  trialsExpiredWithoutUsage: number;
};

/**
 * Trials remain exempt contracts. At the trial boundary a workspace with seats
 * gets a private paid draft, while the exempt contract moves into the normal
 * three-day grace state. A payment confirmation is the only operation that
 * replaces the current trial contract.
 */
@Injectable()
export class PackageTrialAutoconvertService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Optional()
    @Inject(BillingTrialReminderService)
    private readonly reminders?: BillingTrialReminderService,
  ) {}

  async processDueTrials(now = new Date()): Promise<TrialAutoconvertResult> {
    const result: TrialAutoconvertResult = {
      notices: 0,
      draftsCreated: 0,
      trialsExpiredWithoutUsage: 0,
    };
    if (!this.configuration.isTrialAutoconvertEnabled()) {
      return result;
    }

    const noticeBoundary = addDays(now, 3);
    const noticeCandidates = await this.prisma.workspaceSubscription.findMany({
      where: {
        isCurrent: true,
        contractStatus: "exempt",
        trialEndsAt: { lte: noticeBoundary },
      },
      select: { id: true },
    });
    for (const candidate of noticeCandidates) {
      if (await this.recordD3Notice(candidate.id)) {
        result.notices += 1;
      }
      await this.reminders?.sendOnce(candidate.id, "d3");
    }

    const dueTrials = await this.prisma.workspaceSubscription.findMany({
      where: {
        isCurrent: true,
        contractStatus: "exempt",
        trialEndsAt: { lte: now },
        trialAutoconvertDisabled: false,
      },
      select: { id: true },
    });
    for (const trial of dueTrials) {
      const outcome = await this.convertTrial(trial.id, now);
      result.draftsCreated += outcome.draftCreated ? 1 : 0;
      result.trialsExpiredWithoutUsage += outcome.expiredWithoutUsage ? 1 : 0;
      if (outcome.graceStarted || outcome.expiredWithoutUsage) {
        await this.reminders?.sendOnce(trial.id, "day_of");
      }
      if (outcome.graceStarted) {
        await this.reminders?.sendOnce(trial.id, "post");
      }
    }
    return result;
  }

  private async recordD3Notice(subscriptionId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const trial = await transaction.workspaceSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (
        !trial ||
        !trial.isCurrent ||
        trial.contractStatus !== "exempt" ||
        !trial.trialEndsAt
      ) {
        return false;
      }
      const alreadyAudited = await transaction.billingContractAudit.findFirst({
        where: { subscriptionId, action: "trial.autoconvert_d3" },
      });
      if (alreadyAudited) {
        return false;
      }
      await transaction.billingContractAudit.create({
        data: {
          workspaceId: trial.workspaceId,
          subscriptionId: trial.id,
          planId: trial.planId,
          actorType: "system",
          action: "trial.autoconvert_d3",
          reason: "Trial termina em ate tres dias",
          afterSnapshot: this.snapshot(trial),
        },
      });
      return true;
    });
  }

  private async convertTrial(
    subscriptionId: string,
    now: Date,
  ): Promise<{ draftCreated: boolean; expiredWithoutUsage: boolean; graceStarted: boolean }> {
    return this.prisma.$transaction(
      async (transaction) => {
        const initial = await transaction.workspaceSubscription.findUnique({
          where: { id: subscriptionId },
        });
        if (!initial) {
          return { draftCreated: false, expiredWithoutUsage: false, graceStarted: false };
        }
        await this.lockWorkspace(transaction, initial.workspaceId);
        const trial = await transaction.workspaceSubscription.findUnique({
          where: { id: subscriptionId },
        });
        if (
          !trial ||
          !trial.isCurrent ||
          trial.contractStatus !== "exempt" ||
          trial.trialAutoconvertDisabled ||
          !trial.trialEndsAt ||
          trial.trialEndsAt.getTime() > now.getTime()
        ) {
          return { draftCreated: false, expiredWithoutUsage: false, graceStarted: false };
        }

        const occupied = await transaction.whatsappSeat.count({
          where: {
            workspaceId: trial.workspaceId,
            status: { in: ["reserved", "active", "suspended"] },
          },
        });
        if (occupied === 0) {
          const ended = await transaction.workspaceSubscription.update({
            where: { id: trial.id },
            data: {
              isCurrent: false,
              endedAt: now,
              accessEndsAt: now,
            },
          });
          await transaction.billingContractAudit.create({
            data: {
              workspaceId: trial.workspaceId,
              subscriptionId: trial.id,
              planId: trial.planId,
              actorType: "system",
              action: "trial.ended_without_usage",
              reason: "Trial encerrado sem numeros conectados",
              beforeSnapshot: this.snapshot(trial),
              afterSnapshot: this.snapshot(ended),
            },
          });
          return { draftCreated: false, expiredWithoutUsage: true, graceStarted: false };
        }

        const idempotencyReason = `trial_autoconvert:${trial.id}`;
        const existingDraft = await transaction.workspaceSubscription.findFirst({
          where: {
            workspaceId: trial.workspaceId,
            assignmentReason: idempotencyReason,
            contractStatus: { in: ["draft", "awaiting_payment"] },
          },
          orderBy: { createdAt: "desc" },
        });
        let draftCreated = false;
        let draft = existingDraft;
        if (!draft) {
          const plan = await transaction.subscriptionPlan.upsert({
            where: { slug: this.dynamicPlanSlug(occupied) },
            create: {
              name: this.dynamicPlanName(occupied),
              slug: this.dynamicPlanSlug(occupied),
              kind: "standard",
              visibility: "private",
              monthlyPriceCents: occupied * INDIVIDUAL_NUMBER_PRICE_CENTS,
              includedWhatsappNumbers: occupied,
              pricePerWhatsappInstanceCents: INDIVIDUAL_NUMBER_PRICE_CENTS,
              version: 1,
              active: true,
            },
            update: {},
          });
          draft = await transaction.workspaceSubscription.create({
            data: {
              workspaceId: trial.workspaceId,
              planId: plan.id,
              status: "pending",
              activeInstances: occupied,
              contractStatus: "draft",
              isCurrent: false,
              planNameSnapshot: plan.name,
              planVersionSnapshot: plan.version,
              monthlyPriceCentsSnapshot:
                occupied * INDIVIDUAL_NUMBER_PRICE_CENTS,
              includedWhatsappNumbersSnapshot: occupied,
              assignedAt: now,
              assignmentReason: idempotencyReason,
              fiscalStatus: "not_configured",
            },
          });
          draftCreated = true;
          await transaction.billingContractAudit.create({
            data: {
              workspaceId: trial.workspaceId,
              subscriptionId: draft.id,
              planId: plan.id,
              actorType: "system",
              action: "trial.paid_draft_created",
              reason: `Conversao automatica com ${occupied} número(s) conectado(s)`,
              afterSnapshot: this.snapshot(draft),
            },
          });
        }

        const graceEndsAt = addDays(trial.trialEndsAt, 3);
        const graceTrial = await transaction.workspaceSubscription.update({
          where: { id: trial.id },
          data: {
            contractStatus: "grace_period",
            status: "past_due",
            accessEndsAt: graceEndsAt,
            graceEndsAt,
          },
        });
        await transaction.billingContractAudit.create({
          data: {
            workspaceId: trial.workspaceId,
            subscriptionId: trial.id,
            planId: trial.planId,
            actorType: "system",
            action: "trial.grace_started",
            reason: "Aguardando pagamento do rascunho pos-trial",
            beforeSnapshot: this.snapshot(trial),
            afterSnapshot: this.snapshot(graceTrial),
          },
        });
        return { draftCreated, expiredWithoutUsage: false, graceStarted: true };
      },
      { isolationLevel: "Serializable" },
    );
  }

  private dynamicPlanSlug(capacity: number): string {
    return `trial-autoconvert-${capacity}-numbers`;
  }

  private dynamicPlanName(capacity: number): string {
    return `Pago ${capacity} número${capacity === 1 ? "" : "s"}`;
  }

  private async lockWorkspace(
    transaction: TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,
    );
  }

  private snapshot(contract: WorkspaceSubscription): Prisma.InputJsonObject {
    return {
      id: contract.id,
      workspaceId: contract.workspaceId,
      contractStatus: contract.contractStatus,
      isCurrent: contract.isCurrent,
      includedWhatsappNumbersSnapshot: contract.includedWhatsappNumbersSnapshot,
      monthlyPriceCentsSnapshot: contract.monthlyPriceCentsSnapshot,
      trialEndsAt: contract.trialEndsAt?.toISOString() ?? null,
      graceEndsAt: contract.graceEndsAt?.toISOString() ?? null,
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
    };
  }
}
