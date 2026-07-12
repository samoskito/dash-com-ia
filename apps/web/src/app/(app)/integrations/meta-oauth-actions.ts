"use server";

import type {
  CurrentWorkspaceDto,
  IntegrationStartActionDto,
  MetaAssetsDto,
  MetaConnectionDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";
import { metaAssetsRefreshSucceeded } from "./meta-connection-state";

export async function startMetaOAuthForCurrentWorkspace(): Promise<IntegrationStartActionDto> {
  const workspace = await serverApiFetch<CurrentWorkspaceDto>(
    "/workspaces/current",
  );

  if (!workspace.permissions.canManageIntegrations) {
    throw new Error("MetaOAuthWorkspacePermissionDenied");
  }

  return serverApiFetch<IntegrationStartActionDto>(
    `/integrations/meta/start?workspaceId=${encodeURIComponent(workspace.id)}`,
  );
}

export async function completeMetaOAuthForCurrentWorkspace(): Promise<MetaAssetsDto> {
  const workspace = await serverApiFetch<CurrentWorkspaceDto>(
    "/workspaces/current",
  );
  const connection = await serverApiFetch<MetaConnectionDto>(
    "/integrations/meta/connection",
  );

  if (
    connection.workspaceId !== workspace.id ||
    connection.status !== "connected"
  ) {
    throw new Error("MetaOAuthWorkspaceConnectionMismatch");
  }

  const assets = await serverApiFetch<MetaAssetsDto>(
    "/integrations/meta/assets/refresh",
    {
      method: "POST",
      body: JSON.stringify({ businessId: null }),
    },
  );

  if (
    assets.workspaceId !== workspace.id ||
    !metaAssetsRefreshSucceeded(assets)
  ) {
    throw new Error("MetaOAuthWorkspaceAssetsMismatch");
  }

  revalidatePath("/integrations");
  return assets;
}
