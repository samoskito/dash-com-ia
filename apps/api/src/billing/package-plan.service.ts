import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, SubscriptionPlan } from "@prisma/client";
import type {
  WhatsappPackagePlanCreateInputDto,
  WhatsappPackagePlanDto,
  WhatsappPackagePlanUpdateInputDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class PackagePlanService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPublicPlans(): Promise<WhatsappPackagePlanDto[]> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        active: true,
        kind: "standard",
        visibility: "public",
        monthlyPriceCents: { not: null },
        includedWhatsappNumbers: { not: null },
      },
      orderBy: [{ monthlyPriceCents: "asc" }, { name: "asc" }],
    });

    return plans.map((plan) => this.mapPlan(plan));
  }

  async listBackofficePlans(): Promise<WhatsappPackagePlanDto[]> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        monthlyPriceCents: { not: null },
        includedWhatsappNumbers: { not: null },
      },
      orderBy: [
        { active: "desc" },
        { monthlyPriceCents: "asc" },
        { name: "asc" },
      ],
    });

    return plans.map((plan) => this.mapPlan(plan));
  }

  async getPackagePlan(id: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        id,
        monthlyPriceCents: { not: null },
        includedWhatsappNumbers: { not: null },
      },
    });

    if (!plan) {
      throw new NotFoundException("Plano de pacote nao encontrado");
    }

    return plan;
  }

  async createPlan(
    input: WhatsappPackagePlanCreateInputDto,
    actorUserId: string,
  ): Promise<WhatsappPackagePlanDto> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: input.slug },
    });

    if (existing) {
      throw new ConflictException("Ja existe um plano com este identificador");
    }

    const plan = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.subscriptionPlan.create({
        data: {
          name: input.name,
          slug: input.slug,
          kind: input.kind,
          visibility: input.visibility,
          monthlyPriceCents: input.monthlyPriceCents,
          includedWhatsappNumbers: input.includedWhatsappNumbers,
          pricePerWhatsappInstanceCents: this.compatibilityUnitPrice(
            input.monthlyPriceCents,
            input.includedWhatsappNumbers,
          ),
          version: 1,
          active: input.active,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId,
          actorType: "platform_owner",
          action: "package_plan.created",
          targetType: "subscription_plan",
          targetId: created.id,
          reason: input.reason,
          resultStatus: "success",
          afterSummary: this.planSnapshot(created),
        },
      });

      return created;
    });

    return this.mapPlan(plan);
  }

  async updatePlan(
    id: string,
    input: WhatsappPackagePlanUpdateInputDto,
    actorUserId: string,
  ): Promise<WhatsappPackagePlanDto> {
    const existing = await this.getPackagePlan(id);
    const monthlyPriceCents =
      input.monthlyPriceCents ?? existing.monthlyPriceCents;
    const includedWhatsappNumbers =
      input.includedWhatsappNumbers ?? existing.includedWhatsappNumbers;

    if (monthlyPriceCents === null || includedWhatsappNumbers === null) {
      throw new ConflictException("Plano de pacote incompleto");
    }

    if (existing.kind === "exempt" && monthlyPriceCents !== 0) {
      throw new ConflictException(
        "Plano isento deve permanecer com valor zero",
      );
    }

    if (
      existing.kind !== "standard" &&
      input.visibility &&
      input.visibility !== "private"
    ) {
      throw new ConflictException("Planos especiais devem permanecer privados");
    }

    const plan = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.subscriptionPlan.update({
        where: { id },
        data: {
          name: input.name,
          visibility:
            existing.kind === "standard" ? input.visibility : "private",
          monthlyPriceCents: input.monthlyPriceCents,
          includedWhatsappNumbers: input.includedWhatsappNumbers,
          pricePerWhatsappInstanceCents: this.compatibilityUnitPrice(
            monthlyPriceCents,
            includedWhatsappNumbers,
          ),
          active: input.active,
          version: { increment: 1 },
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId,
          actorType: "platform_owner",
          action: "package_plan.updated",
          targetType: "subscription_plan",
          targetId: updated.id,
          reason: input.reason,
          resultStatus: "success",
          beforeSummary: this.planSnapshot(existing),
          afterSummary: this.planSnapshot(updated),
        },
      });

      return updated;
    });

    return this.mapPlan(plan);
  }

  mapPlan(plan: SubscriptionPlan): WhatsappPackagePlanDto {
    if (
      plan.monthlyPriceCents === null ||
      plan.includedWhatsappNumbers === null
    ) {
      throw new ConflictException("Registro legado nao representa um pacote");
    }

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      kind: plan.kind,
      visibility: plan.visibility,
      monthlyPriceCents: plan.monthlyPriceCents,
      includedWhatsappNumbers: plan.includedWhatsappNumbers,
      version: plan.version,
      active: plan.active,
    };
  }

  private compatibilityUnitPrice(
    monthlyPriceCents: number,
    includedWhatsappNumbers: number,
  ): number {
    if (monthlyPriceCents === 0) {
      return 0;
    }

    return Math.ceil(monthlyPriceCents / includedWhatsappNumbers);
  }

  private planSnapshot(plan: SubscriptionPlan): Prisma.InputJsonObject {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      kind: plan.kind,
      visibility: plan.visibility,
      monthlyPriceCents: plan.monthlyPriceCents,
      includedWhatsappNumbers: plan.includedWhatsappNumbers,
      version: plan.version,
      active: plan.active,
    };
  }
}
