import { describe, expect, it } from "vitest";
import { clientNavigation, backofficeNavigation } from "@wpptrack/shared";

describe("navigation", () => {
  it("keeps the client panel focused on final customer operations", () => {
    expect(clientNavigation.map((item) => item.id)).toEqual([
      "overview",
      "leads",
      "reports",
      "integrations",
      "settings"
    ]);
    expect(clientNavigation.map((item) => item.label)).not.toContain("Clientes");
  });

  it("keeps internal backoffice separate", () => {
    expect(backofficeNavigation.map((item) => item.id)).toEqual([
      "workspaces",
      "billing",
      "split",
      "diagnostics"
    ]);
  });
});
