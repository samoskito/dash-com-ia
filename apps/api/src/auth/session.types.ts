import type { PlatformRole, WorkspaceDto } from "@wpptrack/shared";

export type AuthenticatedUser = {
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: string;
    emailVerifiedAt: Date | null;
    platformRole?: PlatformRole | null;
  };
  activeWorkspaceId: string | null;
  workspaces: WorkspaceDto[];
  supportContext?: {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    operationalStatus?: "active" | "blocked";
    startedAt: string;
  } | null;
};
