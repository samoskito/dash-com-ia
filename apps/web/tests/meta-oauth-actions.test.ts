import { afterEach, describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    toString: (): string => "wpptrack_session=web-support-session"
  }))
}));

import {
  completeMetaOAuthForCurrentWorkspace,
  startMetaOAuthForCurrentWorkspace
} from "../src/app/(app)/integrations/meta-oauth-actions";

const barbieriWorkspace = {
  id: "workspace_barbieri",
  name: "Barbieri",
  slug: "barbieri",
  role: "owner",
  operationalStatus: "active",
  permissions: {
    canInviteMembers: true,
    canManageBilling: true,
    canManageIntegrations: true,
    canViewReports: true
  }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  revalidatePath.mockClear();
});

describe("Meta OAuth server actions", () => {
  it("starts OAuth with the workspace from the web support session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(barbieriWorkspace))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "meta",
          action: "oauth_redirect",
          label: "Conectar Meta via OAuth",
          href: "https://www.facebook.com/v25.0/dialog/oauth?state=barbieri",
          missingEnv: []
        })
      );

    await expect(startMetaOAuthForCurrentWorkspace()).resolves.toMatchObject({
      action: "oauth_redirect",
      href: expect.stringContaining("state=barbieri")
    });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/integrations/meta/start?workspaceId=workspace_barbieri"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Cookie: "wpptrack_session=web-support-session"
      })
    });
  });

  it("refreshes only when connection and assets belong to Barbieri", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(barbieriWorkspace))
      .mockResolvedValueOnce(
        jsonResponse({
          workspaceId: "workspace_barbieri",
          status: "connected",
          tokenType: "bearer",
          scopes: ["business_management"],
          expiresAt: null,
          connectedAt: "2026-07-12T14:00:00.000Z",
          selectedBusinessId: null,
          selectedAdAccountId: null,
          selectedPixelId: null,
          capiTokenConfigured: false
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          workspaceId: "workspace_barbieri",
          status: "connected",
          businesses: [{ id: "business_1", name: "BM Barbieri" }],
          adAccounts: [],
          pixels: [],
          pages: [],
          selection: {
            businessId: null,
            adAccountId: null,
            pixelId: null
          },
          lastSyncedAt: "2026-07-12T14:01:00.000Z",
          syncError: null
        })
      );

    await expect(completeMetaOAuthForCurrentWorkspace()).resolves.toMatchObject({
      workspaceId: "workspace_barbieri",
      businesses: [{ name: "BM Barbieri" }]
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/integrations/meta/assets/refresh"
    );
    expect(revalidatePath).toHaveBeenCalledWith("/integrations");
  });

  it("blocks a PalmUp connection while the page is in Barbieri support", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(barbieriWorkspace))
      .mockResolvedValueOnce(
        jsonResponse({
          workspaceId: "workspace_palmup",
          status: "connected",
          tokenType: "bearer",
          scopes: ["business_management"],
          expiresAt: null,
          connectedAt: "2026-07-12T14:00:00.000Z",
          selectedBusinessId: null,
          selectedAdAccountId: null,
          selectedPixelId: null,
          capiTokenConfigured: false
        })
      );

    await expect(completeMetaOAuthForCurrentWorkspace()).rejects.toThrow(
      "MetaOAuthWorkspaceConnectionMismatch"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
