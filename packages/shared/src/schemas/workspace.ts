import { z } from "zod";
import { platformRoles, workspaceRoles } from "../roles";

export const workspaceOperationalStatuses = ["active", "blocked"] as const;

export const workspacePermissionsSchema = z.object({
  canInviteMembers: z.boolean(),
  canManageBilling: z.boolean(),
  canManageIntegrations: z.boolean(),
  canViewReports: z.boolean()
});

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  role: z.enum(workspaceRoles),
  operationalStatus: z.enum(workspaceOperationalStatuses).default("active")
});

export const workspaceListEntrySchema = workspaceSchema.extend({
  permissions: workspacePermissionsSchema
});

export const workspaceListSchema = z.array(workspaceListEntrySchema);

export const currentWorkspaceSchema = workspaceSchema.extend({
  permissions: workspacePermissionsSchema,
  accessMode: z.enum(["member", "platform_support"]).optional(),
  platformRole: z.enum(platformRoles).nullable().optional()
});

export const workspaceUpdateInputSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export const workspaceActiveInputSchema = z.object({
  workspaceId: z.string().trim().min(1)
});

export const workspaceBillingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  asaasCustomerId: z.string().min(1).nullable(),
  operationalStatus: z.enum(workspaceOperationalStatuses),
  subscriptionStatus: z.enum([
    "not_configured",
    "active",
    "pending",
    "overdue",
    "cancelled"
  ]),
  activeInstances: z.number().int().nonnegative()
});

export const workspaceBillingListSchema = z.array(workspaceBillingSchema);

export const workspaceBillingUpdateInputSchema = z.object({
  asaasCustomerId: z.string().trim().min(1).nullable()
});

export const workspaceOperationalStatusUpdateInputSchema = z.object({
  operationalStatus: z.enum(workspaceOperationalStatuses)
});

export const workspaceMemberSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(workspaceRoles),
  joinedAt: z.string().datetime()
});

export const workspaceInviteInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  role: z.enum(workspaceRoles).refine((role) => role !== "owner", {
    message: "Convites nao podem criar owners diretamente"
  })
});

export const workspaceInviteSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  role: z.enum(workspaceRoles),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string().datetime(),
  acceptToken: z.string().min(16).optional()
});

export const workspaceInviteAcceptInputSchema = z.object({
  token: z.string().trim().min(16)
});

export const workspaceInviteAcceptSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(workspaceRoles),
  status: z.literal("accepted")
});

export type WorkspaceDto = z.infer<typeof workspaceSchema>;
export type WorkspaceListEntryDto = z.infer<typeof workspaceListEntrySchema>;
export type WorkspaceListDto = z.infer<typeof workspaceListSchema>;
export type WorkspacePermissionsDto = z.infer<
  typeof workspacePermissionsSchema
>;
export type CurrentWorkspaceDto = z.infer<typeof currentWorkspaceSchema>;
export type WorkspaceActiveInputDto = z.infer<
  typeof workspaceActiveInputSchema
>;
export type WorkspaceUpdateInputDto = z.infer<
  typeof workspaceUpdateInputSchema
>;
export type WorkspaceBillingDto = z.infer<typeof workspaceBillingSchema>;
export type WorkspaceBillingListDto = z.infer<
  typeof workspaceBillingListSchema
>;
export type WorkspaceBillingUpdateInputDto = z.infer<
  typeof workspaceBillingUpdateInputSchema
>;
export type WorkspaceOperationalStatus =
  (typeof workspaceOperationalStatuses)[number];
export type WorkspaceOperationalStatusUpdateInputDto = z.infer<
  typeof workspaceOperationalStatusUpdateInputSchema
>;
export type WorkspaceMemberDto = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceInviteInputDto = z.infer<
  typeof workspaceInviteInputSchema
>;
export type WorkspaceInviteDto = z.infer<typeof workspaceInviteSchema>;
export type WorkspaceInviteAcceptInputDto = z.infer<
  typeof workspaceInviteAcceptInputSchema
>;
export type WorkspaceInviteAcceptDto = z.infer<
  typeof workspaceInviteAcceptSchema
>;
