import { describe, expect, it } from "vitest";
import {
  clientNavVisibleForPermissions,
  type WorkspacePermissionsDto,
} from "../src";

function permissions(
  overrides: Partial<WorkspacePermissionsDto> = {},
): WorkspacePermissionsDto {
  return {
    canInviteMembers: false,
    canManageMembers: false,
    canGrantMemberManager: false,
    canManageBilling: false,
    canManageIntegrations: false,
    canManageWorkspaceSettings: false,
    canTransferOwnership: false,
    canViewReports: true,
    canExportReports: true,
    ...overrides,
  };
}

describe("clientNavVisibleForPermissions", () => {
  it("always shows operational items for a member", () => {
    const memberPermissions = permissions();

    expect(
      clientNavVisibleForPermissions("overview", memberPermissions),
    ).toBe(true);
    expect(clientNavVisibleForPermissions("leads", memberPermissions)).toBe(
      true,
    );
    expect(clientNavVisibleForPermissions("reports", memberPermissions)).toBe(
      true,
    );
    expect(clientNavVisibleForPermissions("events", memberPermissions)).toBe(
      true,
    );
  });

  it("hides integrations, settings and subscription for a member", () => {
    const memberPermissions = permissions();

    expect(
      clientNavVisibleForPermissions("integrations", memberPermissions),
    ).toBe(false);
    expect(
      clientNavVisibleForPermissions("settings", memberPermissions),
    ).toBe(false);
    expect(
      clientNavVisibleForPermissions("subscription", memberPermissions),
    ).toBe(false);
  });

  it("shows integrations and settings but hides subscription for an admin without billing", () => {
    const adminPermissions = permissions({
      canManageIntegrations: true,
      canManageWorkspaceSettings: true,
      canManageBilling: false,
    });

    expect(
      clientNavVisibleForPermissions("integrations", adminPermissions),
    ).toBe(true);
    expect(
      clientNavVisibleForPermissions("settings", adminPermissions),
    ).toBe(true);
    expect(
      clientNavVisibleForPermissions("subscription", adminPermissions),
    ).toBe(false);
  });

  it("shows everything for an owner", () => {
    const ownerPermissions = permissions({
      canManageIntegrations: true,
      canManageWorkspaceSettings: true,
      canManageBilling: true,
    });

    expect(
      clientNavVisibleForPermissions("integrations", ownerPermissions),
    ).toBe(true);
    expect(clientNavVisibleForPermissions("settings", ownerPermissions)).toBe(
      true,
    );
    expect(
      clientNavVisibleForPermissions("subscription", ownerPermissions),
    ).toBe(true);
  });

  it("fails closed when permissions are missing", () => {
    expect(clientNavVisibleForPermissions("integrations", null)).toBe(false);
    expect(clientNavVisibleForPermissions("settings", undefined)).toBe(false);
    expect(clientNavVisibleForPermissions("overview", null)).toBe(true);
  });
});
