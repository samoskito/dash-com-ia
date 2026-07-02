import type { WorkspaceDto } from "@wpptrack/shared";

export type AuthenticatedUser = {
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: string;
    emailVerifiedAt: Date | null;
  };
  workspaces: WorkspaceDto[];
};
