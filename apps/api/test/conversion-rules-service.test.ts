import { describe, expect, it } from "vitest";
import { ConversionRulesService } from "../src/conversion-rules/conversion-rules.service";

type Rule = {
  id: string;
  workspaceId: string;
  name: string;
  triggerType: "keyword" | "whatsapp_label";
  triggerValue: string;
  matchMode: "contains" | "exact";
  eventName: string;
  pixelId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakePrisma = {
  conversionRule: {
    findMany: (args: unknown) => Promise<Rule[]>;
    create: (args: unknown) => Promise<Rule>;
    update: (args: unknown) => Promise<Rule>;
  };
};

function createHarness() {
  const now = new Date("2026-07-02T03:00:00.000Z");
  const db = {
    rules: [
      {
        id: "rule_1",
        workspaceId: "workspace_1",
        name: "Compra por palavra",
        triggerType: "keyword",
        triggerValue: "quero comprar",
        matchMode: "contains",
        eventName: "QualifiedLead",
        pixelId: null,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "rule_2",
        workspaceId: "workspace_1",
        name: "Venda fechada",
        triggerType: "whatsapp_label",
        triggerValue: "Venda fechada",
        matchMode: "exact",
        eventName: "Purchase",
        pixelId: "pixel_1",
        active: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "rule_3",
        workspaceId: "workspace_1",
        name: "Inativa",
        triggerType: "keyword",
        triggerValue: "ignorar",
        matchMode: "contains",
        eventName: "LeadSubmitted",
        pixelId: null,
        active: false,
        createdAt: now,
        updatedAt: now
      }
    ] as Rule[]
  };
  const prisma: FakePrisma = {
    conversionRule: {
      findMany: async (args) => {
        const { where } = args as { where: Partial<Rule> };
        return db.rules.filter((rule) =>
          Object.entries(where).every(([key, value]) => rule[key as keyof Rule] === value)
        );
      },
      create: async (args) => {
        const { data } = args as { data: Omit<Rule, "id" | "createdAt" | "updatedAt"> };
        const rule = {
          id: `rule_${db.rules.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now
        };
        db.rules.push(rule);
        return rule;
      },
      update: async (args) => {
        const { data, where } = args as { data: Partial<Rule>; where: { id: string; workspaceId: string } };
        const index = db.rules.findIndex(
          (rule) => rule.id === where.id && rule.workspaceId === where.workspaceId
        );
        db.rules[index] = {
          ...db.rules[index],
          ...data,
          updatedAt: now
        };
        return db.rules[index];
      }
    }
  };

  return {
    db,
    service: new ConversionRulesService(prisma as never)
  };
}

describe("conversion rules service", () => {
  it("creates conversion rules scoped to the workspace", async () => {
    const { db, service } = createHarness();

    const created = await service.createRule("workspace_1", {
      name: "Etiqueta VIP",
      triggerType: "whatsapp_label",
      triggerValue: "VIP",
      matchMode: "exact",
      eventName: "Purchase",
      pixelId: "pixel_2",
      active: true
    });

    expect(created).toMatchObject({
      workspaceId: "workspace_1",
      triggerType: "whatsapp_label",
      eventName: "Purchase",
      active: true
    });
    expect(db.rules).toHaveLength(4);
  });

  it("matches active keyword and WhatsApp label rules without triggering inactive rules", async () => {
    const { service } = createHarness();

    const matches = await service.evaluateTriggers("workspace_1", {
      messageText: "Oi, eu quero comprar agora",
      labels: ["Venda fechada", "Ignorar"]
    });

    expect(matches.map((rule) => rule.id)).toEqual(["rule_1", "rule_2"]);
    expect(matches.map((rule) => rule.eventName)).toEqual(["QualifiedLead", "Purchase"]);
  });

  it("updates only the requested workspace rule", async () => {
    const { service } = createHarness();

    const updated = await service.updateRule("workspace_1", "rule_1", {
      active: false
    });

    expect(updated.active).toBe(false);
  });
});
