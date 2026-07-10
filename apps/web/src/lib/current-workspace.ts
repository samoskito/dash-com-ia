import type { CurrentWorkspaceDto } from "@wpptrack/shared";
import { cache } from "react";
import { serverApiFetch } from "./server-api";

// React cache deduplicates the authenticated workspace read within one RSC request.
export const getCurrentWorkspace = cache(() =>
  serverApiFetch<CurrentWorkspaceDto>("/workspaces/current"),
);
