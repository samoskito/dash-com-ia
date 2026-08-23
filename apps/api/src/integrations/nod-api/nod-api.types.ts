import type { UazapiConnectionResult } from "../uazapi/uazapi.adapter";

export type NodApiRequest = {
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  ip?: string;
};

/** Attached to the request by NodApiAuthGuard / NodApiHealthAuthGuard. */
export type NodApiAuthContext = {
  license: import("@prisma/client").License;
  fingerprint: string;
};

export type NodApiHealthResponse = {
  ok: boolean;
  upstreamConfigured: boolean;
  nodApiEnabled: boolean;
  nodApiExpiresAt: string | null;
};

export type NodApiCreateInstanceResponse = {
  instanceId: string;
  instanceToken: string;
  status: "created";
};

export type NodApiInstanceStatusResponse = {
  instanceId: string;
  status: UazapiConnectionResult["connectionStatus"];
  qrCode: string | null;
  connectedPhone: string | null;
  message: string | null;
};
