import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import type { EmailEnvelopeContext } from "./email.types";

type DeliveryStateInput = Pick<
  EmailEnvelopeContext,
  "workspaceId" | "actionType" | "actionId" | "actionVersion"
> & {
  status: "sent" | "failed";
};

@Injectable()
export class EmailActionStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: DeliveryStateInput): Promise<void> {
    if (input.actionType !== "WorkspaceInvite" || !input.workspaceId) {
      return;
    }

    const expiresAt = new Date(input.actionVersion);

    if (Number.isNaN(expiresAt.getTime())) {
      return;
    }

    await this.prisma.workspaceInvite.updateMany({
      where: {
        id: input.actionId,
        workspaceId: input.workspaceId,
        expiresAt,
        status: {
          in: ["pending", "sent", "failed"],
        },
      },
      data: {
        status: input.status,
      },
    });
  }
}
