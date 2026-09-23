import { describe, expect, it, vi } from "vitest";

vi.mock("../src/components/presentation-mode-toggle", () => ({
  usePresentationMode: () => true,
}));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewFilters } from "../src/app/(app)/overview/overview-filters";

describe("overview filters", () => {
  it("preserves the instance filter while masking its option in presentation mode", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewFilters, {
        hasActiveFilter: true,
        reportingAccounts: [],
        whatsappInstanceId: "instance_private",
        whatsappInstances: [
          {
            id: "instance_private",
            name: "Chip privado",
            provider: "uazapi",
            billingStatus: "active",
            providerInstanceId: "5511999991234",
            checkoutUrl: null,
            createdAt: "2026-07-01T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Instancia WhatsApp");
    expect(html).toContain("Instancia oculta");
    expect(html).toContain('name="whatsappInstanceId"');
    expect(html).toContain('value="instance_private"');
    expect(html).not.toContain("Chip privado");
    expect(html).not.toContain("1234");
  });
});
