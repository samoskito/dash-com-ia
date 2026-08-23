import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { License } from "@prisma/client";
import { UazapiAdapter } from "../uazapi/uazapi.adapter";
import { throwNodApiError } from "./nod-api.errors";
import { scrubSecrets } from "./nod-api-scrub.util";
import type {
  NodApiCreateInstanceResponse,
  NodApiHealthResponse,
  NodApiInstanceStatusResponse,
} from "./nod-api.types";

const INSTANCE_NAME_MAX_LENGTH = 64;

@Injectable()
export class NodApiService {
  private readonly logger = new Logger(NodApiService.name);

  constructor(@Inject(UazapiAdapter) private readonly uazapi: UazapiAdapter) {}

  async health(license: License): Promise<NodApiHealthResponse> {
    const upstream = await this.uazapi.getHealth();
    const upstreamConfigured = upstream.status === "connected";
    return scrubSecrets({
      ok: upstreamConfigured,
      upstreamConfigured,
      nodApiEnabled: license.nodApiEnabled,
      nodApiExpiresAt: license.nodApiExpiresAt
        ? license.nodApiExpiresAt.toISOString()
        : null,
    });
  }

  async createInstance(
    license: License,
    name: string | undefined,
  ): Promise<NodApiCreateInstanceResponse> {
    const instanceName = (name?.trim() || `nod-api-${license.keyPrefix}`).slice(
      0,
      INSTANCE_NAME_MAX_LENGTH,
    );
    // localInstanceId/workspaceId are opaque correlation fields sent upstream
    // (adminField01/02) — there is no real workspace here, so scope both to
    // the license itself.
    const result = await this.uazapi.createInstance({
      name: instanceName,
      localInstanceId: `nod-api:${license.id}`,
      workspaceId: `nod-api:${license.id}`,
    });

    if (result.status === "not_configured") {
      this.logger.warn(
        `NOD API createInstance unavailable for license ${license.keyPrefix}: upstream not configured`,
      );
      throwNodApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "nod_api_upstream_not_configured",
        "NOD API broker is not configured (missing UAZAPI_BASE_URL/UAZAPI_ADMIN_TOKEN).",
      );
    }

    if (result.status === "error" || !result.providerInstanceId || !result.instanceToken) {
      this.logger.warn(
        `NOD API createInstance failed for license ${license.keyPrefix}: ${result.message ?? "unknown error"}`,
      );
      throwNodApiError(
        HttpStatus.BAD_GATEWAY,
        "nod_api_upstream_error",
        result.message ?? "Failed to create Uazapi instance.",
      );
    }

    return scrubSecrets({
      instanceId: result.providerInstanceId,
      instanceToken: result.instanceToken,
      status: "created" as const,
    });
  }

  async instanceStatus(
    instanceId: string,
    instanceToken: string,
  ): Promise<NodApiInstanceStatusResponse> {
    const result = await this.uazapi.getInstanceStatus(instanceId, instanceToken);
    return scrubSecrets({
      instanceId: result.providerInstanceId ?? instanceId,
      status: result.connectionStatus,
      qrCode: result.qrCode,
      connectedPhone: result.connectedPhone,
      message: result.message,
    });
  }
}
