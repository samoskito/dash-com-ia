import type { MetaAssetsDto, MetaConnectionDto } from "@wpptrack/shared";

export function resolveMetaStatus(
  connectionStatus?: MetaConnectionDto["status"],
  assetsStatus?: MetaAssetsDto["status"]
) {
  return connectionStatus ?? assetsStatus;
}
