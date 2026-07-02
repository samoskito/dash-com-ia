import { Inject, Injectable } from "@nestjs/common";
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
    input: SplitReceiverCreateInputDto
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

    return this.toDto(receiver);
  }

  async updateReceiver(
    receiverId: string,
    input: SplitReceiverUpdateInputDto
  ): Promise<SplitReceiverDto> {
    const receiver = await this.prisma.splitReceiver.update({
      where: { id: receiverId },
      data: {
        ...input,
        email: input.email === undefined ? undefined : input.email
      }
    });

    return this.toDto(receiver);
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
