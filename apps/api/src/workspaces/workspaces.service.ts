import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  backofficeClientWorkspaceListSchema,
  clientWorkspaceProvisionResultSchema,
  type BackofficeClientWorkspaceDto,
  type ClientWorkspaceProvisionInputDto,
  type ClientWorkspaceProvisionResultDto,
  type CurrentWorkspaceDto,
  type BackofficeWhatsappInstanceDto,
  type WorkspaceBillingDto,
  type WorkspaceBillingUpdateInputDto,
  type WorkspaceOperationalStatusUpdateInputDto,
  type WorkspaceInviteDto,
  type WorkspaceInviteAcceptDto,
  type WorkspaceInviteAcceptInputDto,
  type WorkspaceInviteInputDto,
  type WorkspaceListDto,
  type WorkspaceMemberManagerUpdateInputDto,
  type WorkspaceMemberDto,
  type WorkspaceMemberRoleUpdateInputDto,
  type WorkspacePermissionsDto,
  type WorkspaceUpdateInputDto,
  type WorkspaceRole
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "../auth/password.service";
import type { AuthenticatedUser } from "../auth/session.types";
import {
  WorkspaceAccessPolicyService,
  type WorkspacePolicySubject
} from "./workspace-access-policy.service";
import { WorkspaceContextService } from "./workspace-context.service";

type WorkspaceBillingRecord = {
  id: string;
  name: string;
  slug: string;
  asaasCustomerId: string | null;
  operationalStatus: "active" | "blocked";
  subscriptions?: Array<{
    status: string;
    activeInstances: number;
  }>;
  whatsappInstances?: Array<{
    id: string;
  }>;
};

type BackofficeWhatsappInstanceRecord = {
  id: string;
  name: string;
  provider: string;
  status: string;
  providerInstanceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  workspaceId: string;
  workspace: {
    name: string;
  };
};

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(PasswordService)
    private readonly passwordService: PasswordService = new PasswordService(),
    @Optional()
    @Inject(WorkspaceContextService)
    private readonly workspaceContext: WorkspaceContextService = new WorkspaceContextService(),
    @Optional()
    @Inject(WorkspaceAccessPolicyService)
    private readonly accessPolicy: WorkspaceAccessPolicyService = new WorkspaceAccessPolicyService()
  ) {}

  getPermissions(
    role: WorkspaceRole,
    canManageMembers = false
  ): WorkspacePermissionsDto {
    return this.workspaceContext.getPermissions(role, canManageMembers);
  }

  listAvailableWorkspaces(authenticated: AuthenticatedUser): WorkspaceListDto {
    return this.workspaceContext.listMemberships(authenticated);
  }

  getCurrentWorkspace(authenticated: AuthenticatedUser): CurrentWorkspaceDto {
    return this.workspaceContext.getCurrentWorkspace(authenticated);
  }

  async listClientWorkspaces(): Promise<BackofficeClientWorkspaceDto[]> {
    const workspaces = await this.prisma.workspace.findMany({
      include: {
        members: {
          where: { role: "owner" },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: "asc" }
        },
        _count: {
          select: { externalDataConnectors: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return backofficeClientWorkspaceListSchema.parse(
      workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        operationalStatus: workspace.operationalStatus,
        createdAt: workspace.createdAt.toISOString(),
        owners: workspace.members.map((member) => ({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email
        })),
        connectorCount: workspace._count.externalDataConnectors
      }))
    );
  }

  async provisionClientWorkspace(
    input: ClientWorkspaceProvisionInputDto,
    actorUserId: string
  ): Promise<ClientWorkspaceProvisionResultDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true, name: true, email: true }
    });

    if (!existingUser && !input.ownerPassword) {
      throw new BadRequestException(
        "Senha inicial obrigatoria para um novo responsavel"
      );
    }

    const passwordHash =
      !existingUser && input.ownerPassword
        ? await this.passwordService.hash(input.ownerPassword)
        : null;
    const result = await this.prisma.$transaction(async (tx) => {
      const slug = await this.resolveWorkspaceSlug(tx, input.workspaceName);
      const workspace = await tx.workspace.create({
        data: {
          name: input.workspaceName,
          slug
        }
      });
      const owner =
        existingUser ??
        (await tx.user.create({
          data: {
            name: input.ownerName,
            email: input.ownerEmail,
            passwordHash: passwordHash!,
            authProvider: "email",
            emailVerifiedAt: new Date()
          }
        }));

      const existingOwnerMembership = await tx.workspaceMember.findFirst({
        where: {
          workspaceId: workspace.id,
          role: "owner"
        },
        select: { id: true }
      });

      if (existingOwnerMembership) {
        throw new ConflictException("Workspace ja possui um responsavel");
      }

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: "owner"
        }
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId,
          actorType: "platform_admin",
          action: "workspace.client_provisioned",
          targetType: "Workspace",
          targetId: workspace.id,
          resultStatus: "success",
          beforeSummary: Prisma.JsonNull,
          afterSummary: {
            workspaceName: workspace.name,
            workspaceSlug: workspace.slug,
            ownerUserId: owner.id,
            ownerEmail: owner.email,
            reusedExistingUser: Boolean(existingUser)
          }
        }
      });

      return { workspace, owner };
    });

    return clientWorkspaceProvisionResultSchema.parse({
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
        operationalStatus: result.workspace.operationalStatus
      },
      owner: {
        id: result.owner.id,
        name: result.owner.name,
        email: result.owner.email,
        role: "owner"
      }
    });
  }

  private async resolveWorkspaceSlug(
    prisma: Prisma.TransactionClient,
    workspaceName: string
  ): Promise<string> {
    const baseSlug = this.slugify(workspaceName);
    let candidate = baseSlug;
    let suffix = 2;

    while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "workspace";
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      canManageMembers: member.canManageMembers,
      joinedAt: member.createdAt.toISOString()
    }));
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInviteDto[]> {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId },
      orderBy: {
        createdAt: "desc"
      }
    });

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString()
    }));
  }

  async updateMemberRole(
    authenticated: AuthenticatedUser,
    memberId: string,
    input: WorkspaceMemberRoleUpdateInputDto
  ): Promise<WorkspaceMemberDto> {
    const { actor, workspace } = this.requireTeamManager(authenticated);
    const target = await this.findWorkspaceMember(workspace.id, memberId);

    if (
      !this.accessPolicy.canManageMember(
        actor,
        target,
        target.userId === authenticated.user.id
      )
    ) {
      throw new ForbiddenException("Sem permissao para alterar este membro");
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: {
        role: input.role,
        canManageMembers:
          input.role === "admin" ? target.canManageMembers : false
      },
      include: { user: true }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.member_role_updated",
      targetType: "WorkspaceMember",
      targetId: target.id,
      resultStatus: "success",
      beforeSummary: {
        role: target.role,
        canManageMembers: target.canManageMembers
      } as Prisma.InputJsonValue,
      afterSummary: {
        role: updated.role,
        canManageMembers: updated.canManageMembers
      } as Prisma.InputJsonValue
    });

    return this.toWorkspaceMemberDto(updated);
  }

  async updateMemberManagerCapability(
    authenticated: AuthenticatedUser,
    memberId: string,
    input: WorkspaceMemberManagerUpdateInputDto
  ): Promise<WorkspaceMemberDto> {
    const workspace = this.getCurrentWorkspace(authenticated);

    if (workspace.accessMode !== "member" || workspace.role !== "owner") {
      throw new ForbiddenException(
        "Somente o owner pode delegar a gestao da equipe"
      );
    }

    const target = await this.findWorkspaceMember(workspace.id, memberId);

    if (target.role !== "admin") {
      throw new BadRequestException(
        "A gestao da equipe so pode ser delegada a administradores"
      );
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { canManageMembers: input.canManageMembers },
      include: { user: true }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.member_manager_updated",
      targetType: "WorkspaceMember",
      targetId: target.id,
      resultStatus: "success",
      beforeSummary: {
        role: target.role,
        canManageMembers: target.canManageMembers
      } as Prisma.InputJsonValue,
      afterSummary: {
        role: updated.role,
        canManageMembers: updated.canManageMembers
      } as Prisma.InputJsonValue
    });

    return this.toWorkspaceMemberDto(updated);
  }

  async removeMember(
    authenticated: AuthenticatedUser,
    memberId: string
  ): Promise<{ memberId: string; status: "removed" }> {
    const { actor, workspace } = this.requireTeamManager(authenticated);
    const target = await this.findWorkspaceMember(workspace.id, memberId);

    if (
      !this.accessPolicy.canManageMember(
        actor,
        target,
        target.userId === authenticated.user.id
      )
    ) {
      throw new ForbiddenException("Sem permissao para remover este membro");
    }

    const revokedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.delete({
        where: { id: target.id }
      });
      await tx.authSession.updateMany({
        where: {
          userId: target.userId,
          activeWorkspaceId: workspace.id,
          revokedAt: null
        },
        data: { revokedAt }
      });
      await tx.user.updateMany({
        where: {
          id: target.userId,
          lastWorkspaceId: workspace.id
        },
        data: { lastWorkspaceId: null }
      });
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.member_removed",
      targetType: "WorkspaceMember",
      targetId: target.id,
      resultStatus: "success",
      beforeSummary: {
        userId: target.userId,
        role: target.role,
        canManageMembers: target.canManageMembers
      } as Prisma.InputJsonValue,
      afterSummary: {
        status: "removed",
        activeWorkspaceSessionsRevokedAt: revokedAt.toISOString()
      } as Prisma.InputJsonValue
    });

    return { memberId: target.id, status: "removed" };
  }

  async updateCurrentWorkspace(
    authenticated: AuthenticatedUser,
    input: WorkspaceUpdateInputDto
  ): Promise<CurrentWorkspaceDto> {
    const workspace = this.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canManageWorkspaceSettings) {
      throw new ForbiddenException("Sem permissao para atualizar workspace");
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: input.name
      },
      select: {
        id: true,
        name: true,
        slug: true
      }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.profile_updated",
      targetType: "Workspace",
      targetId: workspace.id,
      resultStatus: "success",
      beforeSummary: {
        name: workspace.name,
        slug: workspace.slug
      } as Prisma.InputJsonValue,
      afterSummary: {
        name: updated.name,
        slug: updated.slug
      } as Prisma.InputJsonValue
    });

    return {
      ...updated,
      role: workspace.role,
      operationalStatus: workspace.operationalStatus,
      permissions: workspace.permissions,
      accessMode: workspace.accessMode,
      platformRole: workspace.platformRole
    };
  }

  async getBillingConfiguration(
    workspaceId: string
  ): Promise<WorkspaceBillingDto> {
    const workspace = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        operationalStatus: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      }
    })) as WorkspaceBillingRecord | null;

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    return this.toWorkspaceBillingDto(workspace);
  }

  async listBillingConfigurations(): Promise<WorkspaceBillingDto[]> {
    const workspaces = (await this.prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        operationalStatus: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    })) as WorkspaceBillingRecord[];

    return workspaces.map((workspace) => this.toWorkspaceBillingDto(workspace));
  }

  async listBackofficeWhatsappInstances(): Promise<
    BackofficeWhatsappInstanceDto[]
  > {
    const instances = (await this.prisma.whatsappInstance.findMany({
      include: {
        workspace: {
          select: {
            name: true
          }
        }
      },
      orderBy: [
        {
          workspace: {
            name: "asc"
          }
        },
        {
          createdAt: "desc"
        }
      ]
    })) as BackofficeWhatsappInstanceRecord[];

    return instances.map((instance) => ({
      id: instance.id,
      workspaceId: instance.workspaceId,
      workspaceName: instance.workspace.name,
      name: instance.name,
      provider: this.toWhatsappProvider(instance.provider),
      billingStatus: this.toWhatsappBillingStatus(instance.status),
      providerInstanceId: instance.providerInstanceId,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString()
    }));
  }

  async updateBillingConfiguration(
    workspaceId: string,
    input: WorkspaceBillingUpdateInputDto,
    actorUserId?: string
  ): Promise<WorkspaceBillingDto> {
    const before = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        asaasCustomerId: true,
        operationalStatus: true
      }
    })) as Pick<
      WorkspaceBillingRecord,
      "id" | "asaasCustomerId" | "operationalStatus"
    > | null;
    const workspace = (await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        asaasCustomerId: input.asaasCustomerId?.trim() || null
      },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        operationalStatus: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      }
    })) as WorkspaceBillingRecord;

    if (actorUserId) {
      await this.recordWorkspaceAudit({
        workspaceId: workspace.id,
        actorUserId,
        actorType: "platform_operator",
        action: "workspace.billing_updated",
        targetType: "Workspace",
        targetId: workspace.id,
        resultStatus: "success",
        beforeSummary: this.workspaceBillingAuditSummary(
          before?.asaasCustomerId ?? null
        ),
        afterSummary: this.workspaceBillingAuditSummary(
          workspace.asaasCustomerId
        )
      });
    }

    return this.toWorkspaceBillingDto(workspace);
  }

  async updateOperationalStatus(
    workspaceId: string,
    input: WorkspaceOperationalStatusUpdateInputDto,
    actorUserId?: string
  ): Promise<WorkspaceBillingDto> {
    const before = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        operationalStatus: true
      }
    })) as Pick<WorkspaceBillingRecord, "id" | "operationalStatus"> | null;

    const workspace = (await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        operationalStatus: input.operationalStatus
      },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        operationalStatus: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      }
    })) as WorkspaceBillingRecord;

    if (actorUserId) {
      await this.recordWorkspaceAudit({
        workspaceId: workspace.id,
        actorUserId,
        actorType: "platform_operator",
        action: "workspace.operational_status_updated",
        targetType: "Workspace",
        targetId: workspace.id,
        resultStatus: "success",
        beforeSummary: {
          operationalStatus: before?.operationalStatus ?? "active"
        } as Prisma.InputJsonValue,
        afterSummary: {
          operationalStatus: workspace.operationalStatus
        } as Prisma.InputJsonValue
      });
    }

    return this.toWorkspaceBillingDto(workspace);
  }

  async createInvite(
    authenticated: AuthenticatedUser,
    input: WorkspaceInviteInputDto
  ): Promise<WorkspaceInviteDto> {
    const { workspace } = this.requireTeamManager(authenticated);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const acceptToken = randomBytes(32).toString("hex");
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        email: input.email,
        role: input.role,
        tokenHash: this.hashInviteToken(acceptToken),
        expiresAt
      }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_created",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "pending",
      afterSummary: {
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString()
      } as Prisma.InputJsonValue
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      acceptToken
    };
  }

  async resendInvite(
    authenticated: AuthenticatedUser,
    inviteId: string
  ): Promise<WorkspaceInviteDto> {
    const { workspace } = this.requireTeamManager(authenticated);
    const invite = await this.findWorkspaceInvite(workspace.id, inviteId);

    if (invite.status === "accepted") {
      throw new BadRequestException("Convite ja foi aceito");
    }

    const acceptToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const updated = await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash: this.hashInviteToken(acceptToken),
        status: "pending",
        expiresAt,
        acceptedAt: null
      }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_resent",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "pending",
      beforeSummary: {
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString()
      } as Prisma.InputJsonValue,
      afterSummary: {
        invitedEmailHash: this.hashAuditValue(updated.email),
        role: updated.role,
        status: updated.status,
        expiresAt: updated.expiresAt.toISOString()
      } as Prisma.InputJsonValue
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      expiresAt: updated.expiresAt.toISOString(),
      acceptToken
    };
  }

  async revokeInvite(
    authenticated: AuthenticatedUser,
    inviteId: string
  ): Promise<WorkspaceInviteDto> {
    const { workspace } = this.requireTeamManager(authenticated);
    const invite = await this.findWorkspaceInvite(workspace.id, inviteId);

    if (invite.status === "accepted") {
      throw new BadRequestException("Convite ja foi aceito");
    }

    const updated = await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "revoked" }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_revoked",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "revoked",
      beforeSummary: {
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role,
        status: invite.status
      } as Prisma.InputJsonValue,
      afterSummary: {
        invitedEmailHash: this.hashAuditValue(updated.email),
        role: updated.role,
        status: updated.status
      } as Prisma.InputJsonValue
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      expiresAt: updated.expiresAt.toISOString()
    };
  }

  async acceptInvite(
    authenticated: AuthenticatedUser,
    input: WorkspaceInviteAcceptInputDto
  ): Promise<WorkspaceInviteAcceptDto> {
    const tokenHash = this.hashInviteToken(input.token);
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash }
    });

    if (!invite) {
      throw new NotFoundException("Convite nao encontrado");
    }

    if (invite.status !== "pending") {
      throw new BadRequestException("Convite nao esta pendente");
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: "expired" }
      });
      await this.recordWorkspaceAudit({
        workspaceId: invite.workspaceId,
        actorUserId: authenticated.user.id,
        action: "workspace.invite_expired",
        targetType: "WorkspaceInvite",
        targetId: invite.id,
        resultStatus: "expired",
        beforeSummary: {
          status: "pending",
          invitedEmailHash: this.hashAuditValue(invite.email),
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString()
        } as Prisma.InputJsonValue,
        afterSummary: {
          status: "expired"
        } as Prisma.InputJsonValue
      });
      throw new BadRequestException("Convite expirado");
    }

    if (invite.email.toLowerCase() !== authenticated.user.email.toLowerCase()) {
      throw new ForbiddenException("Convite pertence a outro email");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: authenticated.user.id,
          role: invite.role
        }
      });
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: new Date()
        }
      });

      return {
        workspaceId: invite.workspaceId,
        memberId: member.id,
        role: invite.role,
        status: "accepted" as const
      };
    });
    await this.recordWorkspaceAudit({
      workspaceId: invite.workspaceId,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_accepted",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "accepted",
      beforeSummary: {
        status: "pending",
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role
      } as Prisma.InputJsonValue,
      afterSummary: {
        status: "accepted",
        memberId: result.memberId,
        userId: authenticated.user.id,
        role: result.role
      } as Prisma.InputJsonValue
    });

    return result;
  }

  private requireTeamManager(authenticated: AuthenticatedUser): {
    actor: WorkspacePolicySubject;
    workspace: CurrentWorkspaceDto;
  } {
    const workspace = this.getCurrentWorkspace(authenticated);
    const membership = authenticated.workspaces.find(
      (candidate) => candidate.id === workspace.id
    );

    if (
      workspace.accessMode !== "member" ||
      !membership ||
      !workspace.permissions.canManageMembers
    ) {
      throw new ForbiddenException("Sem permissao para gerenciar membros");
    }

    return {
      actor: {
        role: membership.role,
        canManageMembers: membership.canManageMembers === true
      },
      workspace
    };
  }

  private async findWorkspaceMember(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId
      },
      include: { user: true }
    });

    if (!member) {
      throw new NotFoundException("Membro nao encontrado");
    }

    return member;
  }

  private async findWorkspaceInvite(workspaceId: string, inviteId: string) {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId
      }
    });

    if (!invite) {
      throw new NotFoundException("Convite nao encontrado");
    }

    return invite;
  }

  private toWorkspaceMemberDto(member: {
    id: string;
    userId: string;
    role: WorkspaceRole;
    canManageMembers: boolean;
    createdAt: Date;
    user: {
      email: string;
      name: string | null;
    };
  }): WorkspaceMemberDto {
    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      canManageMembers: member.canManageMembers,
      joinedAt: member.createdAt.toISOString()
    };
  }

  private hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashAuditValue(value: string): string {
    return createHash("sha256")
      .update(value.trim().toLowerCase())
      .digest("hex");
  }

  private async recordWorkspaceAudit(input: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    resultStatus: string;
    actorType?: string;
    beforeSummary?: Prisma.InputJsonValue;
    afterSummary?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: input.actorType ?? "user",
          action: input.action,
          targetType: input.targetType,
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

  private workspaceBillingAuditSummary(
    asaasCustomerId: string | null
  ): Prisma.InputJsonValue {
    return {
      asaasCustomerConfigured: Boolean(asaasCustomerId),
      asaasCustomerIdHash: asaasCustomerId
        ? this.hashAuditValue(asaasCustomerId)
        : null
    } as Prisma.InputJsonValue;
  }

  private toWorkspaceBillingDto(
    workspace: WorkspaceBillingRecord
  ): WorkspaceBillingDto {
    const subscription = workspace.subscriptions?.[0];

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      asaasCustomerId: workspace.asaasCustomerId,
      operationalStatus: workspace.operationalStatus,
      subscriptionStatus: this.toWorkspaceBillingStatus(subscription?.status),
      activeInstances:
        subscription?.activeInstances ??
        workspace.whatsappInstances?.length ??
        0
    };
  }

  private toWorkspaceBillingStatus(
    status: string | undefined
  ): WorkspaceBillingDto["subscriptionStatus"] {
    if (
      status === "active" ||
      status === "pending" ||
      status === "overdue" ||
      status === "cancelled"
    ) {
      return status;
    }

    return "not_configured";
  }

  private toWhatsappProvider(
    provider: string
  ): BackofficeWhatsappInstanceDto["provider"] {
    return provider === "cloud_api" ? "cloud_api" : "uazapi";
  }

  private toWhatsappBillingStatus(
    status: string
  ): BackofficeWhatsappInstanceDto["billingStatus"] {
    if (
      status === "active" ||
      status === "disconnected" ||
      status === "suspended" ||
      status === "error"
    ) {
      return status;
    }

    return "pending_payment";
  }
}
