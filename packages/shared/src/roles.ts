export const workspaceRoles = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const platformRoles = ["platform_owner", "platform_operator"] as const;

export type PlatformRole = (typeof platformRoles)[number];

export function canManageWorkspaceBilling(role: WorkspaceRole): boolean {
  return role === "owner";
}

export function canManageIntegrations(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canViewReports(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}
