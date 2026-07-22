import { describe, expect, it } from "vitest";
import { parseUmblerAutomationV1 } from "../src/inbound-webhooks/providers/umbler/umbler-automation-v1.parser";

const qualifiedLeadPayload = {
  schema: "wpptrack.umbler.automation.v1",
  source: "umbler_tag_automation",
  automation: "lead_qualificado",
  contact: {
    phone: "+5511999999999",
    name: "Contato de teste",
  },
  conversation: {
    id: "conversation_test_1",
    created_at_utc: "2026-07-22 16:59:29",
  },
};

describe("Umbler automation v1 parser", () => {
  it("parses the certified qualified lead callback without retaining the name", () => {
    const parsed = parseUmblerAutomationV1(qualifiedLeadPayload);

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        schema: "wpptrack.umbler.automation.v1",
        source: "umbler_tag_automation",
        automation: "lead_qualificado",
        eventName: "QualifiedLead",
        phone: "5511999999999",
        conversationId: "conversation_test_1",
        occurredAt: new Date("2026-07-22T16:59:29.000Z"),
      },
    });
    expect(parsed.ok && parsed.value.externalExecutionKey).toMatch(
      /^umbler-automation:[0-9a-f]{64}$/u,
    );
    expect(JSON.stringify(parsed)).not.toContain("Contato de teste");
  });

  it("maps the average-value purchase automation to Purchase", () => {
    const parsed = parseUmblerAutomationV1({
      ...qualifiedLeadPayload,
      automation: "compra_aprovada",
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        automation: "compra_aprovada",
        eventName: "Purchase",
      },
    });
  });

  it("rejects unknown contracts, automations, phones, and timestamps", () => {
    const invalidPayloads = [
      { ...qualifiedLeadPayload, schema: "unknown" },
      { ...qualifiedLeadPayload, automation: "qualquer_evento" },
      {
        ...qualifiedLeadPayload,
        contact: { phone: "123" },
      },
      {
        ...qualifiedLeadPayload,
        conversation: {
          ...qualifiedLeadPayload.conversation,
          created_at_utc: "22/07/2026 16:59:29",
        },
      },
    ];

    for (const payload of invalidPayloads) {
      expect(parseUmblerAutomationV1(payload)).toEqual({
        ok: false,
        errorCode: "umbler_automation_v1_invalid_payload",
      });
    }
  });
});
