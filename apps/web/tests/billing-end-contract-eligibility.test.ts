import { describe, expect, it } from "vitest";
import type { WorkspaceSubscriptionContractStatus } from "@wpptrack/shared";
import { selectEndableContractIds } from "../src/app/(backoffice)/backoffice/billing/end-contract-eligibility";

function entry(
  id: string,
  status: WorkspaceSubscriptionContractStatus,
  overrides: { workspaceId?: string; canCancel?: boolean; isCurrent?: boolean } = {},
) {
  const { workspaceId = "workspace_1", ...contractFlags } = overrides;

  return {
    workspace: { id: workspaceId },
    contract: { id, status, ...contractFlags },
  };
}

describe("backoffice endable contract eligibility", () => {
  it("offers Encerrar for contracts that never got past checkout", () => {
    const endable = selectEndableContractIds([
      entry("contract_draft", "draft"),
      entry("contract_awaiting", "awaiting_payment"),
    ]);

    expect(endable).toEqual(
      new Set(["contract_draft", "contract_awaiting"]),
    );
  });

  it("never offers Encerrar for the live contract of a workspace", () => {
    const endable = selectEndableContractIds([
      entry("contract_active", "active"),
      entry("contract_past_due", "past_due", { workspaceId: "workspace_2" }),
      entry("contract_suspended", "suspended", { workspaceId: "workspace_3" }),
      entry("contract_canceled", "canceled", { workspaceId: "workspace_4" }),
    ]);

    expect(endable).toEqual(new Set());
  });

  it("offers Encerrar only for the isento rows that lost the capacity seat", () => {
    // The API sends contracts newest first, so the first exempt row is live.
    const endable = selectEndableContractIds([
      entry("contract_exempt_current", "exempt"),
      entry("contract_exempt_old", "exempt"),
      entry("contract_legacy_old", "legacy_protected"),
    ]);

    expect(endable).toEqual(
      new Set(["contract_exempt_old", "contract_legacy_old"]),
    );
  });

  it("keeps each workspace independent when deciding the live contract", () => {
    const endable = selectEndableContractIds([
      entry("workspace_1_exempt", "exempt"),
      entry("workspace_2_exempt", "exempt", { workspaceId: "workspace_2" }),
    ]);

    expect(endable).toEqual(new Set());
  });

  it("prefers the API isCurrent flag over the newest-row guess", () => {
    const endable = selectEndableContractIds([
      entry("contract_exempt_stale", "exempt", { isCurrent: false }),
      entry("contract_exempt_live", "exempt", { isCurrent: true }),
    ]);

    expect(endable).toEqual(new Set(["contract_exempt_stale"]));
  });

  it("defers entirely to canCancel once the API sends it", () => {
    const endable = selectEndableContractIds([
      entry("contract_draft_blocked", "draft", { canCancel: false }),
      entry("contract_active_allowed", "active", { canCancel: true }),
    ]);

    expect(endable).toEqual(new Set(["contract_active_allowed"]));
  });
});
