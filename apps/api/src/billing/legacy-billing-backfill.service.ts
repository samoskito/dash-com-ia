import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type InboundWebhookProvider,
  type SubscriptionPlan,
  type WhatsappSeatProvider,
  type WorkspaceSubscriptionContractStatus,
} from "@prisma/client";
import {
  legacyBillingBackfillConfirmation,
  type LegacyBillingBackfillApplyInputDto,
  type LegacyBillingBackfillApplyResultDto,
  type LegacyBillingBackfillIssueDto,
  type LegacyBillingBackfillReportDto,
  type LegacyBillingBackfillWorkspaceDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";

type LegacyResourceType = "whatsapp_instance" | "external_channel";

export type LegacyBillingResource = {
  id: string;
  workspaceId: string;
  type: LegacyResourceType;
  provider: WhatsappSeatProvider | null;
  normalizedPhone: string | null;
  externalReference: string | null;
  activatedAt: Date | null;
};

export type LegacyBillingSeatRecord = {
  id: string;
  subscriptionId: string;
  provider: WhatsappSeatProvider;
  whatsappInstanceId: string | null;
  inboundWebhookChannelId: string | null;
};

export type LegacyBillingContractRecord = {
  id: string;
  contractStatus: WorkspaceSubscriptionContractStatus;
  includedWhatsappNumbersSnapshot: number | null;
};

export type LegacyBillingWorkspaceInput = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  resources: LegacyBillingResource[];
  seats: LegacyBillingSeatRecord[];
  currentContract: LegacyBillingContractRecord | null;
  additionalIssues?: LegacyBillingBackfillIssueDto[];
};

type ApplyWorkspaceResult = {
  applied: boolean;
  createdContract: boolean;
  updatedContract: boolean;
  createdSeats: number;
  reboundSeats: number;
};

const OCCUPIED_SEAT_STATUSES = ["reserved", "active", "suspended"] as const;
const LEGACY_INSTANCE_STATUSES = [
  "active",
  "disconnected",
  "suspended",
] as const;

@Injectable()
export class LegacyBillingBackfillService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
  ) {}

  async preview(
    workspaceIds?: string[],
  ): Promise<LegacyBillingBackfillReportDto> {
    const normalizedWorkspaceIds = normalizeWorkspaceIds(workspaceIds);
    const [instances, channels, currentContracts, seats] = await Promise.all([
      this.prisma.whatsappInstance.findMany({
        where: {
          workspaceId: normalizedWorkspaceIds
            ? { in: normalizedWorkspaceIds }
            : undefined,
          status: { in: [...LEGACY_INSTANCE_STATUSES] },
        },
        select: {
          id: true,
          workspaceId: true,
          provider: true,
          providerInstanceId: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.inboundWebhookChannel.findMany({
        where: {
          workspaceId: normalizedWorkspaceIds
            ? { in: normalizedWorkspaceIds }
            : undefined,
          status: "active",
          connection: {
            status: "production",
            removedAt: null,
          },
        },
        select: {
          id: true,
          workspaceId: true,
          connectedPhone: true,
          providerChannelId: true,
          productionActivatedAt: true,
          firstSeenAt: true,
          connection: {
            select: {
              provider: true,
            },
          },
        },
      }),
      this.prisma.workspaceSubscription.findMany({
        where: {
          workspaceId: normalizedWorkspaceIds
            ? { in: normalizedWorkspaceIds }
            : undefined,
          isCurrent: true,
          planNameSnapshot: { not: null },
        },
        select: {
          id: true,
          workspaceId: true,
          contractStatus: true,
          includedWhatsappNumbersSnapshot: true,
        },
      }),
      this.prisma.whatsappSeat.findMany({
        where: {
          workspaceId: normalizedWorkspaceIds
            ? { in: normalizedWorkspaceIds }
            : undefined,
          status: { in: [...OCCUPIED_SEAT_STATUSES] },
        },
        select: {
          id: true,
          workspaceId: true,
          subscriptionId: true,
          provider: true,
          whatsappInstanceId: true,
          inboundWebhookChannelId: true,
        },
      }),
    ]);

    const resources: LegacyBillingResource[] = [
      ...instances.map((instance) => ({
        id: instance.id,
        workspaceId: instance.workspaceId,
        type: "whatsapp_instance" as const,
        provider: mapInstanceProvider(instance.provider),
        normalizedPhone: null,
        externalReference: cleanReference(instance.providerInstanceId),
        activatedAt: instance.createdAt,
      })),
      ...channels.map((channel) => ({
        id: channel.id,
        workspaceId: channel.workspaceId,
        type: "external_channel" as const,
        provider: mapInboundProvider(channel.connection.provider),
        normalizedPhone: normalizePhone(channel.connectedPhone),
        externalReference: cleanReference(channel.providerChannelId),
        activatedAt: channel.productionActivatedAt ?? channel.firstSeenAt,
      })),
    ];

    const workspaceIdSet = new Set<string>([
      ...resources.map((resource) => resource.workspaceId),
      ...seats.map((seat) => seat.workspaceId),
      ...currentContracts.map((contract) => contract.workspaceId),
    ]);
    if (normalizedWorkspaceIds) {
      normalizedWorkspaceIds.forEach((workspaceId) =>
        workspaceIdSet.add(workspaceId),
      );
    }

    const workspaces = await this.prisma.workspace.findMany({
      where: { id: { in: [...workspaceIdSet] } },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    const globalIssues = buildGlobalLegacyResourceIssues(resources);
    const entries = workspaces
      .map((workspace) =>
        buildLegacyBackfillWorkspaceInventory({
          workspace,
          resources: resources.filter(
            (resource) => resource.workspaceId === workspace.id,
          ),
          seats: seats
            .filter((seat) => seat.workspaceId === workspace.id)
            .map((seat) => ({
              id: seat.id,
              subscriptionId: seat.subscriptionId,
              provider: seat.provider,
              whatsappInstanceId: seat.whatsappInstanceId,
              inboundWebhookChannelId: seat.inboundWebhookChannelId,
            })),
          currentContract:
            currentContracts.find(
              (contract) => contract.workspaceId === workspace.id,
            ) ?? null,
          additionalIssues: globalIssues.get(workspace.id) ?? [],
        }),
      )
      .filter(
        (entry) =>
          entry.targetCapacity > 0 ||
          entry.existingSeats > 0 ||
          entry.currentContractId !== null,
      )
      .sort((left, right) =>
        left.workspace.name.localeCompare(right.workspace.name, "pt-BR"),
      );

    return buildReport(
      entries,
      this.configuration.isPackageBillingEnabled() &&
        this.configuration.isLegacyBackfillEnabled(),
    );
  }

  async apply(
    input: LegacyBillingBackfillApplyInputDto,
    actorUserId: string,
  ): Promise<LegacyBillingBackfillApplyResultDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isLegacyBackfillEnabled()
    ) {
      throw new ConflictException(
        "Backfill legado desativado pelas travas do ambiente",
      );
    }

    if (input.confirmation !== legacyBillingBackfillConfirmation) {
      throw new ConflictException("Confirmacao do backfill invalida");
    }

    const selectedWorkspaceIds = normalizeWorkspaceIds(input.workspaceIds);
    const before = await this.preview(selectedWorkspaceIds);
    const eligibleEntries = before.workspaces.filter(
      (workspace) => workspace.eligible,
    );

    let appliedWorkspaces = 0;
    let skippedWorkspaces = before.workspaces.length - eligibleEntries.length;
    let createdContracts = 0;
    let updatedContracts = 0;
    let createdSeats = 0;
    let reboundSeats = 0;

    for (const entry of eligibleEntries) {
      const outcome = await this.applyWorkspace(
        entry.workspace.id,
        actorUserId,
        input.reason,
      );

      if (!outcome.applied) {
        skippedWorkspaces += 1;
        continue;
      }

      appliedWorkspaces += 1;
      createdContracts += Number(outcome.createdContract);
      updatedContracts += Number(outcome.updatedContract);
      createdSeats += outcome.createdSeats;
      reboundSeats += outcome.reboundSeats;
    }

    return {
      appliedWorkspaces,
      skippedWorkspaces,
      createdContracts,
      updatedContracts,
      createdSeats,
      reboundSeats,
      report: await this.preview(selectedWorkspaceIds),
    };
  }

  private async applyWorkspace(
    workspaceId: string,
    actorUserId: string,
    reason: string,
  ): Promise<ApplyWorkspaceResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${"wpptrack:legacy-billing-backfill"}))`,
        );
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,
        );

        const [workspace, instances, channels, currentContract, seats] =
          await Promise.all([
            transaction.workspace.findUnique({
              where: { id: workspaceId },
              select: { id: true, name: true, slug: true },
            }),
            transaction.whatsappInstance.findMany({
              where: {
                workspaceId,
                status: { in: [...LEGACY_INSTANCE_STATUSES] },
              },
              select: {
                id: true,
                workspaceId: true,
                provider: true,
                providerInstanceId: true,
                createdAt: true,
              },
            }),
            transaction.inboundWebhookChannel.findMany({
              where: {
                workspaceId,
                status: "active",
                connection: {
                  status: "production",
                  removedAt: null,
                },
              },
              select: {
                id: true,
                workspaceId: true,
                connectedPhone: true,
                providerChannelId: true,
                productionActivatedAt: true,
                firstSeenAt: true,
                connection: {
                  select: {
                    provider: true,
                  },
                },
              },
            }),
            transaction.workspaceSubscription.findFirst({
              where: {
                workspaceId,
                isCurrent: true,
                planNameSnapshot: { not: null },
              },
              select: {
                id: true,
                contractStatus: true,
                includedWhatsappNumbersSnapshot: true,
                activeInstances: true,
                planId: true,
                assignedAt: true,
                assignedByUserId: true,
                activatedAt: true,
              },
              orderBy: { createdAt: "desc" },
            }),
            transaction.whatsappSeat.findMany({
              where: {
                workspaceId,
                status: { in: [...OCCUPIED_SEAT_STATUSES] },
              },
              select: {
                id: true,
                subscriptionId: true,
                provider: true,
                whatsappInstanceId: true,
                inboundWebhookChannelId: true,
              },
            }),
          ]);

        if (!workspace) {
          throw new NotFoundException("Workspace do backfill nao encontrado");
        }

        const resources: LegacyBillingResource[] = [
          ...instances.map((instance) => ({
            id: instance.id,
            workspaceId,
            type: "whatsapp_instance" as const,
            provider: mapInstanceProvider(instance.provider),
            normalizedPhone: null,
            externalReference: cleanReference(instance.providerInstanceId),
            activatedAt: instance.createdAt,
          })),
          ...channels.map((channel) => ({
            id: channel.id,
            workspaceId,
            type: "external_channel" as const,
            provider: mapInboundProvider(channel.connection.provider),
            normalizedPhone: normalizePhone(channel.connectedPhone),
            externalReference: cleanReference(channel.providerChannelId),
            activatedAt: channel.productionActivatedAt ?? channel.firstSeenAt,
          })),
        ];
        const inventory = buildLegacyBackfillWorkspaceInventory({
          workspace,
          resources,
          seats,
          currentContract,
        });

        if (!inventory.eligible) {
          return {
            applied: false,
            createdContract: false,
            updatedContract: false,
            createdSeats: 0,
            reboundSeats: 0,
          };
        }

        const now = new Date();
        const plan = await this.upsertLegacyPlan(
          transaction,
          inventory.targetCapacity,
        );
        let subscriptionId = currentContract?.id ?? null;
        let createdContract = false;
        let updatedContract = false;

        if (!currentContract) {
          const created = await transaction.workspaceSubscription.create({
            data: {
              workspaceId,
              planId: plan.id,
              status: "active",
              activeInstances: inventory.targetCapacity,
              contractStatus: "legacy_protected",
              isCurrent: true,
              planNameSnapshot: plan.name,
              planVersionSnapshot: plan.version,
              monthlyPriceCentsSnapshot: 0,
              includedWhatsappNumbersSnapshot: inventory.targetCapacity,
              assignedAt: now,
              assignedByUserId: actorUserId,
              assignmentReason: reason,
              activatedAt: now,
              fiscalStatus: "not_configured",
            },
          });
          subscriptionId = created.id;
          createdContract = true;
        } else {
          if (currentContract.contractStatus !== "legacy_protected") {
            return {
              applied: false,
              createdContract: false,
              updatedContract: false,
              createdSeats: 0,
              reboundSeats: 0,
            };
          }

          const needsUpdate =
            currentContract.planId !== plan.id ||
            currentContract.includedWhatsappNumbersSnapshot !==
              inventory.targetCapacity ||
            currentContract.activeInstances !== inventory.targetCapacity;
          if (needsUpdate) {
            await transaction.workspaceSubscription.update({
              where: { id: currentContract.id },
              data: {
                planId: plan.id,
                status: "active",
                activeInstances: inventory.targetCapacity,
                planNameSnapshot: plan.name,
                planVersionSnapshot: plan.version,
                monthlyPriceCentsSnapshot: 0,
                includedWhatsappNumbersSnapshot: inventory.targetCapacity,
                assignedAt: currentContract.assignedAt ?? now,
                assignedByUserId:
                  currentContract.assignedByUserId ?? actorUserId,
                assignmentReason: reason,
                activatedAt: currentContract.activatedAt ?? now,
              },
            });
            updatedContract = true;
          }
        }

        if (!subscriptionId) {
          throw new ConflictException(
            "Contrato legado nao foi preparado para as vagas",
          );
        }

        const seatsByTarget = new Map(
          seats.map((seat) => [seatTargetKey(seat), seat]),
        );
        let createdSeats = 0;
        let reboundSeats = 0;

        for (const resource of resources) {
          if (!resource.provider) {
            continue;
          }

          const targetKey = resourceTargetKey(resource);
          const seat = seatsByTarget.get(targetKey);
          if (seat) {
            if (seat.subscriptionId !== subscriptionId) {
              await transaction.whatsappSeat.update({
                where: { id: seat.id },
                data: {
                  subscriptionId,
                  normalizedPhone: resource.normalizedPhone ?? undefined,
                },
              });
              reboundSeats += 1;
            }
            continue;
          }

          const createdSeat = await transaction.whatsappSeat.create({
            data: {
              workspaceId,
              subscriptionId,
              provider: resource.provider,
              normalizedPhone: resource.normalizedPhone,
              whatsappInstanceId:
                resource.type === "whatsapp_instance" ? resource.id : null,
              inboundWebhookChannelId:
                resource.type === "external_channel" ? resource.id : null,
              status: "active",
              activatedAt: resource.activatedAt ?? now,
            },
          });
          createdSeats += 1;

          await transaction.billingContractAudit.create({
            data: {
              workspaceId,
              subscriptionId,
              planId: plan.id,
              actorUserId,
              actorType: "platform_owner",
              action: "legacy_backfill.seat_created",
              reason,
              afterSnapshot: {
                seatId: createdSeat.id,
                provider: createdSeat.provider,
                whatsappInstanceId: createdSeat.whatsappInstanceId,
                inboundWebhookChannelId: createdSeat.inboundWebhookChannelId,
                status: createdSeat.status,
              },
            },
          });
        }

        if (
          createdContract ||
          updatedContract ||
          createdSeats > 0 ||
          reboundSeats > 0
        ) {
          await transaction.billingContractAudit.create({
            data: {
              workspaceId,
              subscriptionId,
              planId: plan.id,
              actorUserId,
              actorType: "platform_owner",
              action: createdContract
                ? "legacy_backfill.contract_created"
                : "legacy_backfill.contract_reconciled",
              reason,
              afterSnapshot: {
                targetCapacity: inventory.targetCapacity,
                activeInstances: inventory.activeInstances,
                externalChannels: inventory.externalChannels,
                createdSeats,
                reboundSeats,
              },
            },
          });
        }

        return {
          applied: true,
          createdContract,
          updatedContract,
          createdSeats,
          reboundSeats,
        };
      },
      { isolationLevel: "Serializable" },
    );
  }

  private async upsertLegacyPlan(
    transaction: Prisma.TransactionClient,
    capacity: number,
  ): Promise<SubscriptionPlan> {
    const slug = `legacy-protected-${capacity}-numbers-v1`;
    const name = `Legado protegido - ${capacity} numero(s)`;

    return transaction.subscriptionPlan.upsert({
      where: { slug },
      create: {
        name,
        slug,
        kind: "legacy_protected",
        visibility: "private",
        monthlyPriceCents: 0,
        includedWhatsappNumbers: capacity,
        pricePerWhatsappInstanceCents: 0,
        version: 1,
        active: true,
      },
      update: {
        name,
        kind: "legacy_protected",
        visibility: "private",
        monthlyPriceCents: 0,
        includedWhatsappNumbers: capacity,
        pricePerWhatsappInstanceCents: 0,
        active: true,
      },
    });
  }
}

export function buildLegacyBackfillWorkspaceInventory(
  input: LegacyBillingWorkspaceInput,
): LegacyBillingBackfillWorkspaceDto {
  const issues: LegacyBillingBackfillIssueDto[] = [
    ...(input.additionalIssues ?? []),
  ];
  const resourceKeys = new Set(
    input.resources.map((resource) => resourceTargetKey(resource)),
  );
  const seatsByTarget = new Map<string, LegacyBillingSeatRecord[]>();
  let orphanedSeats = 0;

  for (const resource of input.resources) {
    if (!resource.provider) {
      issues.push({
        severity: "blocking",
        code: "unsupported_instance_provider",
        message:
          "A instancia usa um provedor sem mapeamento para cobranca por vaga.",
        resourceIds: [resource.id],
      });
    }

    if (!resource.normalizedPhone) {
      issues.push({
        severity: "warning",
        code: "phone_not_available",
        message:
          "O numero normalizado ainda nao esta disponivel; a vaga sera vinculada pelo recurso interno.",
        resourceIds: [resource.id],
      });
    }
  }

  for (const seat of input.seats) {
    const targetKey = seatTargetKey(seat);
    if (!targetKey || !resourceKeys.has(targetKey)) {
      orphanedSeats += 1;
      issues.push({
        severity: "blocking",
        code: "seat_without_production_resource",
        message:
          "Existe uma vaga ocupada sem recurso de producao correspondente.",
        resourceIds: [seat.id],
      });
      continue;
    }

    const group = seatsByTarget.get(targetKey) ?? [];
    group.push(seat);
    seatsByTarget.set(targetKey, group);
  }

  for (const resource of input.resources) {
    const targetKey = resourceTargetKey(resource);
    const matchingSeats = seatsByTarget.get(targetKey) ?? [];
    if (matchingSeats.length > 1) {
      issues.push({
        severity: "blocking",
        code: "duplicate_active_seat",
        message:
          "Mais de uma vaga ocupada aponta para o mesmo recurso de WhatsApp.",
        resourceIds: matchingSeats.map((seat) => seat.id),
      });
    }

    const mismatchedSeat = matchingSeats.find(
      (seat) => resource.provider && seat.provider !== resource.provider,
    );
    if (mismatchedSeat) {
      issues.push({
        severity: "blocking",
        code: "seat_provider_mismatch",
        message:
          "A vaga existente usa um provedor diferente do recurso conectado.",
        resourceIds: [resource.id, mismatchedSeat.id],
      });
    }
  }

  if (
    input.currentContract &&
    input.currentContract.contractStatus !== "legacy_protected"
  ) {
    issues.push({
      severity: "blocking",
      code: "current_commercial_contract_exists",
      message:
        "O workspace ja possui contrato comercial atual e nao sera sobrescrito.",
      resourceIds: [input.currentContract.id],
    });
  }

  const targetCapacity = input.resources.length;
  const existingSeats = [...seatsByTarget.values()].filter(
    (group) => group.length > 0,
  ).length;
  const missingSeats = Math.max(0, targetCapacity - existingSeats);

  if (
    input.currentContract?.contractStatus === "legacy_protected" &&
    input.currentContract.includedWhatsappNumbersSnapshot !== targetCapacity
  ) {
    issues.push({
      severity: "warning",
      code: "legacy_capacity_drift",
      message:
        "A capacidade protegida sera reconciliada com os recursos atuais.",
      resourceIds: [input.currentContract.id],
    });
  }

  const blockingIssues = issues.filter(
    (issue) => issue.severity === "blocking",
  );
  const protectedWorkspace =
    input.currentContract?.contractStatus === "legacy_protected" &&
    missingSeats === 0 &&
    orphanedSeats === 0 &&
    input.currentContract.includedWhatsappNumbersSnapshot === targetCapacity &&
    blockingIssues.length === 0;

  return {
    workspace: input.workspace,
    currentContractId: input.currentContract?.id ?? null,
    currentContractStatus: input.currentContract?.contractStatus ?? null,
    activeInstances: input.resources.filter(
      (resource) => resource.type === "whatsapp_instance",
    ).length,
    externalChannels: input.resources.filter(
      (resource) => resource.type === "external_channel",
    ).length,
    targetCapacity,
    existingSeats,
    missingSeats,
    orphanedSeats,
    protected: protectedWorkspace,
    eligible: targetCapacity > 0 && blockingIssues.length === 0,
    issues: deduplicateIssues(issues),
  };
}

function buildReport(
  entries: LegacyBillingBackfillWorkspaceDto[],
  applyEnabled: boolean,
): LegacyBillingBackfillReportDto {
  return {
    generatedAt: new Date().toISOString(),
    applyEnabled,
    confirmationPhrase: legacyBillingBackfillConfirmation,
    summary: {
      workspaces: entries.length,
      eligibleWorkspaces: entries.filter((entry) => entry.eligible).length,
      protectedWorkspaces: entries.filter((entry) => entry.protected).length,
      totalResources: entries.reduce(
        (total, entry) => total + entry.targetCapacity,
        0,
      ),
      activeInstances: entries.reduce(
        (total, entry) => total + entry.activeInstances,
        0,
      ),
      externalChannels: entries.reduce(
        (total, entry) => total + entry.externalChannels,
        0,
      ),
      existingSeats: entries.reduce(
        (total, entry) => total + entry.existingSeats,
        0,
      ),
      missingSeats: entries.reduce(
        (total, entry) => total + entry.missingSeats,
        0,
      ),
      orphanedSeats: entries.reduce(
        (total, entry) => total + entry.orphanedSeats,
        0,
      ),
      blockingIssues: entries.reduce(
        (total, entry) =>
          total +
          entry.issues.filter((issue) => issue.severity === "blocking").length,
        0,
      ),
    },
    workspaces: entries,
  };
}

export function buildGlobalLegacyResourceIssues(
  resources: LegacyBillingResource[],
): Map<string, LegacyBillingBackfillIssueDto[]> {
  const result = new Map<string, LegacyBillingBackfillIssueDto[]>();
  const phones = groupResources(
    resources.filter((resource) => resource.normalizedPhone),
    (resource) => resource.normalizedPhone as string,
  );
  const references = groupResources(
    resources.filter(
      (resource) => resource.provider && resource.externalReference,
    ),
    (resource) =>
      `${resource.type}:${resource.provider}:${resource.externalReference}`,
  );

  for (const group of phones.values()) {
    if (group.length > 1) {
      addGlobalIssue(result, group, {
        severity: "blocking",
        code: "duplicate_connected_phone",
        message: "O mesmo numero aparece em mais de um recurso de producao.",
        resourceIds: group.map((resource) => resource.id),
      });
    }
  }

  for (const group of references.values()) {
    if (group.length > 1) {
      addGlobalIssue(result, group, {
        severity: "blocking",
        code: "duplicate_provider_reference",
        message:
          "A mesma referencia do provedor aparece em mais de um recurso.",
        resourceIds: group.map((resource) => resource.id),
      });
    }
  }

  return result;
}

function addGlobalIssue(
  target: Map<string, LegacyBillingBackfillIssueDto[]>,
  resources: LegacyBillingResource[],
  issue: LegacyBillingBackfillIssueDto,
): void {
  for (const workspaceId of new Set(
    resources.map((resource) => resource.workspaceId),
  )) {
    const issues = target.get(workspaceId) ?? [];
    issues.push(issue);
    target.set(workspaceId, issues);
  }
}

function groupResources(
  resources: LegacyBillingResource[],
  key: (resource: LegacyBillingResource) => string,
): Map<string, LegacyBillingResource[]> {
  const groups = new Map<string, LegacyBillingResource[]>();
  for (const resource of resources) {
    const groupKey = key(resource);
    const group = groups.get(groupKey) ?? [];
    group.push(resource);
    groups.set(groupKey, group);
  }
  return groups;
}

function deduplicateIssues(
  issues: LegacyBillingBackfillIssueDto[],
): LegacyBillingBackfillIssueDto[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.code}:${[...issue.resourceIds]
      .sort()
      .join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resourceTargetKey(resource: LegacyBillingResource): string {
  return `${resource.type}:${resource.id}`;
}

function seatTargetKey(seat: LegacyBillingSeatRecord): string {
  if (seat.whatsappInstanceId) {
    return `whatsapp_instance:${seat.whatsappInstanceId}`;
  }
  if (seat.inboundWebhookChannelId) {
    return `external_channel:${seat.inboundWebhookChannelId}`;
  }
  return "";
}

function mapInstanceProvider(value: string): WhatsappSeatProvider | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "uazapi") {
    return "uazapi";
  }
  if (
    ["cloud_api", "meta", "meta_cloud_api", "whatsapp_cloud_api"].includes(
      normalized,
    )
  ) {
    return "cloud_api";
  }
  return null;
}

function mapInboundProvider(
  provider: InboundWebhookProvider,
): WhatsappSeatProvider {
  return provider === "umbler" ? "umbler" : "gupshup";
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : null;
}

function cleanReference(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeWorkspaceIds(
  workspaceIds: string[] | undefined,
): string[] | undefined {
  if (!workspaceIds?.length) {
    return undefined;
  }
  return [...new Set(workspaceIds.map((id) => id.trim()).filter(Boolean))];
}
