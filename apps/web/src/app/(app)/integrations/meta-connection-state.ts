import type { MetaAssetsDto, MetaConnectionDto } from "@wpptrack/shared";

export function resolveMetaStatus(
  connectionStatus?: MetaConnectionDto["status"],
  assetsStatus?: MetaAssetsDto["status"]
) {
  return connectionStatus ?? assetsStatus;
}

export function metaAssetsRefreshSucceeded(
  assets: Pick<MetaAssetsDto, "status">
): boolean {
  return assets.status === "connected";
}
