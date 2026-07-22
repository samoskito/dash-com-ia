import type {
  ProviderConversionRuleDto,
  PurchaseReviewDto,
} from "@wpptrack/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PurchaseReviewPanel } from "../src/app/(app)/events/purchase-reviews/purchase-review-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const averageRule: ProviderConversionRuleDto = {
  id: "provider_rule_average",
  workspaceId: "workspace_1",
  conversionRule: {
    id: "conversion_rule_average",
    workspaceId: "workspace_1",
    name: "Compra com valor medio",
    triggerType: "message_phrase",
    triggerValue: "message_phrase",
    matchMode: "exact",
    eventName: "Purchase",
    pixelId: null,
    defaultValueCents: 29_990,
    defaultCurrency: "BRL",
    defaultContentName: "Pedido medio",
    defaultItems: null,
    active: true,
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
  },
  connectionId: "connection_1",
  mode: "observation",
  parserReleaseId: "parser_1",
  productionActivatedAt: null,
  channelIds: ["channel_1"],
  triggerPhrases: ["Aviso de compra"],
  messageAuthorScope: "team",
  endpoint: null,
  catalog: null,
  lastExecution: null,
  createdAt: "2026-07-22T12:00:00.000Z",
  updatedAt: "2026-07-22T12:00:00.000Z",
};

const averageReview: PurchaseReviewDto = {
  id: "review_1",
  workspaceId: "workspace_1",
  providerRuleId: averageRule.id,
  ruleName: averageRule.conversionRule.name,
  sourceDeliveryId: "delivery_1",
  channelId: "channel_1",
  channelName: "Comercial",
  occurredAt: "2026-07-22T13:00:00.000Z",
  sourceType: "provider_message",
  messageAuthorType: "team",
  matchedTriggerPhrase: "Aviso de compra",
  status: "recognized",
  classificationCode: "recognized",
  reasonCode: "matched",
  leadId: "lead_1",
  leadName: "Maria Cliente",
  phoneDisplay: "+55 11 99999-0000",
  items: [],
  calculatedValueCents: 29_990,
  effectiveValueCents: 29_990,
  observedPaymentValueCents: null,
  currency: "BRL",
  conversionEventLogId: null,
  decisionReason: null,
  decidedAt: null,
  createdAt: "2026-07-22T13:00:01.000Z",
  updatedAt: "2026-07-22T13:00:01.000Z",
};

function renderPanel(canManage: boolean, review = averageReview): string {
  return renderToStaticMarkup(
    createElement(PurchaseReviewPanel, {
      canManage,
      providerRules: [averageRule],
      reviews: [review],
    }),
  );
}

describe("purchase review panel", () => {
  it("lets a manager approve an average-value purchase without catalog items", () => {
    const html = renderPanel(true);

    expect(html).toContain("Regra de valor medio");
    expect(html).toContain("R$\u00a0299,90");
    expect(html).toContain("Aprovar e enviar");
    expect(html).not.toContain("Complete os produtos antes de aprovar");
  });

  it("keeps decision controls out of read-only member access", () => {
    const html = renderPanel(false);

    expect(html).toContain("Compra com valor medio");
    expect(html).not.toContain("Aprovar e enviar");
    expect(html).not.toContain("Rejeitar");
  });

  it("does not offer stale actions for a rejected purchase", () => {
    const html = renderPanel(true, {
      ...averageReview,
      status: "rejected",
      reasonCode: "rejected_by_user",
    });

    expect(html).toContain("Rejeitada");
    expect(html).not.toContain("Aprovar e enviar");
    expect(html).not.toContain(">Rejeitar<");
  });
});
