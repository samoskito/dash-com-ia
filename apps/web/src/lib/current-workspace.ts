import type {
  CurrentWorkspaceDto,
  WorkspaceListDto,
  WorkspacePackageAccessDto,
} from "@wpptrack/shared";
import { cache } from "react";
import { serverApiFetch } from "./server-api";

// React cache deduplicates the authenticated workspace read within one RSC request.
export const getCurrentWorkspace = cache(() =>
  serverApiFetch<CurrentWorkspaceDto>("/workspaces/current"),
);

export const getAvailableWorkspaces = cache(() =>
  serverApiFetch<WorkspaceListDto>("/workspaces"),
);

export const getWorkspacePackageAccess = cache(() =>
  serverApiFetch<WorkspacePackageAccessDto>("/billing/package/access"),
);
