import { z } from "zod";
import { workspaceRoles } from "../roles";

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
  role: z.enum(workspaceRoles)
});

export const currentWorkspaceSchema = workspaceSchema.extend({
  permissions: workspacePermissionsSchema
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
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
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
export type WorkspacePermissionsDto = z.infer<
  typeof workspacePermissionsSchema
>;
export type CurrentWorkspaceDto = z.infer<typeof currentWorkspaceSchema>;
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
