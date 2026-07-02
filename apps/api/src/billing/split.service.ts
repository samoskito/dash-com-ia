import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  SplitReceiverCreateInputDto,
  SplitReceiverDto,
  SplitReceiverUpdateInputDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

type PersistedSplitReceiver = {
  id: string;
  name: string;
  walletId: string;
  email: string | null;
  percentageBps: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class SplitService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listReceivers(): Promise<SplitReceiverDto[]> {
    const receivers = await this.prisma.splitReceiver.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }]
    });

    return receivers.map((receiver) => this.toDto(receiver));
  }

  async createReceiver(
    input: SplitReceiverCreateInputDto,
    actorUserId?: string
  ): Promise<SplitReceiverDto> {
    const receiver = await this.prisma.splitReceiver.create({
      data: {
        name: input.name,
        walletId: input.walletId,
        email: input.email ?? null,
        percentageBps: input.percentageBps,
        active: input.active
      }
    });

    await this.recordReceiverAudit({
      actorUserId: actorUserId ?? null,
      action: "split_receiver.created",
      targetId: receiver.id,
      resultStatus: receiver.active ? "active" : "paused",
      beforeSummary: undefined,
      afterSummary: this.receiverAuditSummary(receiver)
    });

    return this.toDto(receiver);
  }

  async updateReceiver(
    receiverId: string,
    input: SplitReceiverUpdateInputDto,
    actorUserId?: string
  ): Promise<SplitReceiverDto> {
    const before = (await this.prisma.splitReceiver.findUnique({
      where: { id: receiverId }
    })) as PersistedSplitReceiver | null;
    const receiver = await this.prisma.splitReceiver.update({
      where: { id: receiverId },
      data: {
        ...input,
        email: input.email === undefined ? undefined : input.email
      }
    });

    await this.recordReceiverAudit({
      actorUserId: actorUserId ?? null,
      action: "split_receiver.updated",
      targetId: receiver.id,
      resultStatus: receiver.active ? "active" : "paused",
      beforeSummary: before ? this.receiverAuditSummary(before) : undefined,
      afterSummary: this.receiverAuditSummary(receiver)
    });

    return this.toDto(receiver);
  }

  private async recordReceiverAudit(input: {
    actorUserId: string | null;
    action: string;
    targetId: string;
    resultStatus: string;
    beforeSummary: Prisma.InputJsonValue | undefined;
    afterSummary: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: null,
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? "platform_operator" : "system",
          action: input.action,
          targetType: "SplitReceiver",
          targetId: input.targetId,
          reason: null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: input.beforeSummary,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  private receiverAuditSummary(
    receiver: PersistedSplitReceiver
  ): Prisma.InputJsonValue {
    return {
      name: receiver.name,
      walletIdHash: this.hashSensitiveValue(receiver.walletId),
      emailHash: receiver.email ? this.hashSensitiveValue(receiver.email) : null,
      percentageBps: receiver.percentageBps,
      active: receiver.active
    } as Prisma.InputJsonValue;
  }

  private hashSensitiveValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private toDto(receiver: PersistedSplitReceiver): SplitReceiverDto {
    return {
      id: receiver.id,
      name: receiver.name,
      walletId: receiver.walletId,
      email: receiver.email,
      percentageBps: receiver.percentageBps,
      active: receiver.active,
      createdAt: receiver.createdAt.toISOString(),
      updatedAt: receiver.updatedAt.toISOString()
    };
  }
}
