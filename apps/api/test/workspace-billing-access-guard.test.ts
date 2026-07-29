import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceBillingAccessGuard } from "../src/billing/workspace-billing-access.guard";

function requestContext(path: string, method = "GET", authenticated = true) {
  const request = {
    headers: authenticated ? { authorization: "Bearer session_token" } : {},
    method,
    originalUrl: path,
  };

  return {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

function createHarness(options?: {
  accessAllowed?: boolean;
  accessReason?: "contract_inactive" | "missing_contract";
  activeWorkspaceId?: string | null;
  enforcementEnabled?: boolean;
  supportContext?: boolean;
  workspaceCount?: number;
}) {
  const workspaceCount = options?.workspaceCount ?? 1;
  const getSession = vi.fn().mockResolvedValue({
    user: {
      id: "user_1",
    },
    activeWorkspaceId:
      options?.activeWorkspaceId === undefined
        ? "workspace_1"
        : options.activeWorkspaceId,
    workspaces: Array.from({ length: workspaceCount }, (_, index) => ({
      id: `workspace_${index + 1}`,
    })),
    supportContext: options?.supportContext
      ? { workspaceId: "workspace_support" }
      : null,
  });
  const configuration = {
    isPackageBillingEnabled: vi.fn().mockReturnValue(true),
    isEnforcementEnabled: vi
      .fn()
      .mockReturnValue(options?.enforcementEnabled ?? true),
  };
  const getWorkspaceAccessState = vi.fn().mockResolvedValue({
    enforcementEnabled: true,
    allowed: options?.accessAllowed ?? true,
    reason: options?.accessReason ?? "active_contract",
    contractStatus: options?.accessAllowed === false ? "suspended" : "active",
    accessEndsAt: null,
  });
  const guard = new WorkspaceBillingAccessGuard(
    { getSession } as never,
    configuration as never,
    { getWorkspaceAccessState } as never,
  );

  return { getSession, getWorkspaceAccessState, guard };
}

describe("WorkspaceBillingAccessGuard", () => {
  it.each([
    ["POST", "/webhooks/inbound/umbler"],
    ["POST", "/webhooks/asaas"],
    ["GET", "/backoffice/billing"],
    ["GET", "/billing/package/state"],
    ["GET", "/health"],
    ["POST", "/auth/login"],
    ["GET", "/workspaces"],
    ["GET", "/workspaces/current"],
    ["POST", "/workspaces/active"],
    ["GET", "/workspaces/invites/inspect?token=invite_1"],
    ["GET", "/integrations/whatsapp/instances"],
    ["OPTIONS", "/reports"],
  ])(
    "allows recovery route %s %s before authentication",
    async (method, path) => {
      const { getSession, guard } = createHarness({
        accessAllowed: false,
      });

      await expect(
        guard.canActivate(requestContext(path, method, false)),
      ).resolves.toBe(true);
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  it("does not enforce contracts while the rollout flag is disabled", async () => {
    const { getSession, guard } = createHarness({
      enforcementEnabled: false,
    });

    await expect(guard.canActivate(requestContext("/reports"))).resolves.toBe(
      true,
    );
    expect(getSession).not.toHaveBeenCalled();
  });

  it("allows platform support to access a suspended workspace", async () => {
    const { getWorkspaceAccessState, guard } = createHarness({
      accessAllowed: false,
      supportContext: true,
    });

    await expect(guard.canActivate(requestContext("/reports"))).resolves.toBe(
      true,
    );
    expect(getWorkspaceAccessState).not.toHaveBeenCalled();
  });

  it("allows a workspace with an active access contract", async () => {
    const { getWorkspaceAccessState, guard } = createHarness();

    await expect(guard.canActivate(requestContext("/reports"))).resolves.toBe(
      true,
    );
    expect(getWorkspaceAccessState).toHaveBeenCalledWith("workspace_1");
  });

  it("leaves workspace selection available when no workspace is active", async () => {
    const { getWorkspaceAccessState, guard } = createHarness({
      activeWorkspaceId: null,
      workspaceCount: 2,
    });

    await expect(guard.canActivate(requestContext("/reports"))).resolves.toBe(
      true,
    );
    expect(getWorkspaceAccessState).not.toHaveBeenCalled();
  });

  it("blocks product APIs with a stable recovery error", async () => {
    const { guard } = createHarness({
      accessAllowed: false,
      accessReason: "contract_inactive",
    });

    let thrown: unknown;
    try {
      await guard.canActivate(requestContext("/reports"));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect((thrown as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      code: "workspace_billing_access_suspended",
      billingAccess: {
        allowed: false,
        reason: "contract_inactive",
      },
    });
  });

  it("does not treat nested instance mutations as recovery routes", async () => {
    const { guard } = createHarness({
      accessAllowed: false,
    });

    await expect(
      guard.canActivate(
        requestContext(
          "/integrations/whatsapp/instances/instance_1/connect",
          "POST",
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
