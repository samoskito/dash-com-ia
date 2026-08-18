import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractXmaxTagIds,
  parseXmaxContactWebhook,
} from "../src/xmax/xmax-contact.parser";
import { mapXmaxTagsToEvent } from "../src/xmax/xmax-event-mapper";

describe("xmax contact parser", () => {
  it("parses Contact_Id / Telefone / Nome and builds ingress key from raw body", () => {
    const body = {
      Contact_Id: 12345,
      Telefone: "11988441020",
      Nome: "Samuel Teste",
      Tags: [],
    };
    const raw = Buffer.from(JSON.stringify(body), "utf8");
    const parsed = parseXmaxContactWebhook(body, raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.contactId).toBe("12345");
    expect(parsed.value.phoneHint).toBe("11988441020");
    expect(parsed.value.name).toBe("Samuel Teste");
    expect(parsed.value.ingressKey).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
  });

  it("rejects payload without contact id", () => {
    const parsed = parseXmaxContactWebhook({ Nome: "x" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("missing_contact_id");
  });

  it("extracts tag ids from object arrays", () => {
    expect(extractXmaxTagIds([{ Id: 55 }, { id: "56" }, "57"])).toEqual([
      "55",
      "56",
      "57",
    ]);
  });
});

describe("xmax event mapper", () => {
  const mapping = {
    qualifiedLeadTagIds: ["55"],
    purchaseTagIds: ["56"],
  };

  it("maps purchase tag to Purchase", () => {
    expect(mapXmaxTagsToEvent(["56"], mapping)).toBe("Purchase");
  });

  it("maps qualified tag to QualifiedLead", () => {
    expect(mapXmaxTagsToEvent(["55"], mapping)).toBe("QualifiedLead");
  });

  it("prioritizes Purchase when both tags are present", () => {
    expect(mapXmaxTagsToEvent(["55", "56"], mapping)).toBe("Purchase");
  });

  it("discards when no mapped tag", () => {
    expect(mapXmaxTagsToEvent(["99"], mapping)).toBeNull();
    expect(mapXmaxTagsToEvent([], mapping)).toBeNull();
  });
});
