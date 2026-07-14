import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import type {
  EmailDeliveryAuditStatus,
  TransactionalEmailTemplateName,
} from "./email.types";

export type EmailDeliveryAuditInput = {
  deliveryId: string;
  workspaceId: string | null;
  template: TransactionalEmailTemplateName | "unknown";
  recipientHash: string;
  status: EmailDeliveryAuditStatus;
  attemptNumber?: number;
  maxAttempts?: number;
  failureKind?: "transient" | "permanent";
  errorCode?: string;
  providerMessageId?: string | null;
};

@Injectable()
export class EmailDeliveryAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: EmailDeliveryAuditInput): Promise<void> {
    const summary = {
      template: input.template,
      recipientHash: input.recipientHash,
      attemptNumber: input.attemptNumber,
      maxAttempts: input.maxAttempts,
      failureKind: input.failureKind,
      errorCode: input.errorCode,
      providerMessageIdHash: input.providerMessageId
        ? this.hash(input.providerMessageId)
        : undefined,
    };

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: null,
          actorType: "system",
          action: `email.delivery_${input.status}`,
          targetType: "EmailDelivery",
          targetId: input.deliveryId,
          reason: input.errorCode ?? null,
          sourceIp: null,
          resultStatus: input.status,
          afterSummary: this.toJsonSummary(summary),
        },
      });
    } catch {
      // Observability must not duplicate or block an email provider side effect.
    }
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private toJsonSummary(value: Record<string, unknown>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
