import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [artifactPath] = process.argv.slice(2);

if (!artifactPath) {
  throw new Error(
    "Usage: node validate-meta-conversation-replay-test.mjs <workflow.json>",
  );
}

const workflow = JSON.parse(await readFile(artifactPath, "utf8"));

function node(name) {
  const found = workflow.nodes.find((candidate) => candidate.name === name);

  if (!found) {
    throw new Error(`Node not found: ${name}`);
  }

  return found;
}

assert.equal(workflow.active, false);
assert.deepEqual(workflow.pinData, {});
assert.equal(
  workflow.nodes.some((candidate) => candidate.type === "n8n-nodes-base.mySql"),
  false,
);
assert.equal(
  workflow.nodes.some(
    (candidate) => candidate.type === "n8n-nodes-base.crypto",
  ),
  false,
);
assert.equal(
  workflow.nodes.some((candidate) => candidate.credentials?.crypto),
  false,
);

const configNode = node("Configurar replay");
const assignments = Object.fromEntries(
  configNode.parameters.assignments.assignments.map((assignment) => [
    assignment.name,
    assignment.value,
  ]),
);
const prepareCode = node("Preparar payload de teste").parameters.jsCode;
const prepare = new Function(
  "$input",
  `return (async () => {\n${prepareCode}\n})();`,
);
const prepared = await prepare({
  first: () => ({
    json: {
      webhook_url: "https://n8n.example.test/webhook/meta",
      payload_json: assignments.payload_json,
    },
  }),
});
const safePayload = JSON.parse(prepared[0].json.raw_body);

assert.equal(safePayload.object, "whatsapp_business_account");
assert.equal(safePayload.wpptrack_test_mode, true);
assert.equal(prepared[0].json.test_mode, true);

const wrappedPrepared = await prepare({
  first: () => ({
    json: {
      webhook_url: "https://n8n.example.test/webhook/meta",
      payload_json: JSON.stringify([
        {
          headers: { "content-type": "application/json" },
          body: JSON.parse(assignments.payload_json),
          executionMode: "production",
        },
      ]),
    },
  }),
});
const wrappedSafePayload = JSON.parse(wrappedPrepared[0].json.raw_body);
assert.equal(wrappedSafePayload.object, "whatsapp_business_account");
assert.equal(wrappedSafePayload.wpptrack_test_mode, true);

const requestNode = node("Enviar replay ao webhook ativo");
assert.equal(requestNode.parameters.contentType, "raw");
assert.equal(requestNode.parameters.rawContentType, "application/json");
assert.equal(requestNode.parameters.body, "={{ $json.raw_body }}");
assert.notEqual(requestNode.parameters.sendHeaders, true);
assert.equal(requestNode.parameters.headerParameters, undefined);
assert.equal(
  workflow.connections["Preparar payload de teste"].main[0][0].node,
  "Enviar replay ao webhook ativo",
);

assert.doesNotMatch(
  JSON.stringify(workflow),
  /Meta App Secret|x-hub-signature|Assinar payload|signature/i,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      workflow: workflow.name,
      scenarios: [
        "synthetic_paid_payload",
        "real_payload_wrapper_supported",
        "test_marker_added_to_body",
        "no_hmac_credential",
        "no_mysql_or_production_side_effect_nodes",
      ],
    },
    null,
    2,
  ),
);
