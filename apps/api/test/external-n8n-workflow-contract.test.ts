import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type WorkflowNode = {
  name: string;
  parameters?: {
    query?: string;
    options?: { queryReplacement?: string };
  };
};

type Workflow = {
  nodes: WorkflowNode[];
};

const workflows = [
  {
    file: "kinbox-qualified-lead-dual-write.json",
    nodeName: "Registrar evento qualificado",
  },
  {
    file: "kinbox-purchase-dual-write.json",
    nodeName: "Registrar evento de compra",
  },
];

describe("Kinbox n8n workflow contract", () => {
  it.each(workflows)(
    "$file persists only the phone resolved from the legacy lead row",
    ({ file, nodeName }) => {
      const path = resolve(
        process.cwd(),
        "../../docs/setup/external-mysql/n8n",
        file,
      );
      const workflow = JSON.parse(readFileSync(path, "utf8")) as Workflow;
      const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
      const query = node?.parameters?.query ?? "";
      const replacements = node?.parameters?.options?.queryReplacement ?? "";

      expect(query).toContain("FROM whatsapp_anuncio_barbieri wa");
      expect(query).toContain("WHERE wa.telefone = $1");
      expect(query).toContain("COALESCE(NULLIF(wa.lid, '')");
      expect(query).toMatch(/\n  wa\.telefone,\n  UTC_TIMESTAMP\(3\),/);
      expect(replacements).not.toContain('["lead_id"]');
      expect(replacements).not.toContain('["external_id"]');
    },
  );
});
