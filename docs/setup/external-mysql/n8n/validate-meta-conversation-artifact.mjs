import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [artifactPath] = process.argv.slice(2);

if (!artifactPath) {
  throw new Error(
    "Usage: node validate-meta-conversation-artifact.mjs <workflow.json>",
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

function hasNode(name) {
  return workflow.nodes.some((candidate) => candidate.name === name);
}

class TestDateTime {
  constructor(milliseconds, zone = "utc") {
    this.date = new Date(milliseconds);
    this.zone = zone;
    this.isValid = !Number.isNaN(this.date.getTime());
  }

  static fromSeconds(seconds, options = {}) {
    return new TestDateTime(Number(seconds) * 1000, options.zone);
  }

  toUTC() {
    return new TestDateTime(this.date.getTime(), "utc");
  }

  setZone(zone) {
    return new TestDateTime(this.date.getTime(), zone);
  }

  toFormat(format) {
    if (format === "yyyy-MM-dd HH:mm:ss.SSS") {
      return this.date.toISOString().replace("T", " ").replace("Z", "");
    }

    if (format === "yyyy-MM-dd") {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: this.zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(this.date);
      const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );
      return `${values.year}-${values.month}-${values.day}`;
    }

    throw new Error(`Unsupported test format: ${format}`);
  }
}

async function executeCode(name, inputItems, nodeAccessor = () => undefined) {
  const code = node(name).parameters.jsCode;
  const run = new Function(
    "$input",
    "DateTime",
    "$",
    `return (async () => {\n${code}\n})();`,
  );

  return await run(
    {
      first: () => inputItems[0],
      all: () => inputItems,
    },
    TestDateTime,
    nodeAccessor,
  );
}

assert.equal(workflow.active, false);
assert.deepEqual(workflow.pinData, {});
assert.deepEqual(node("Webhook1").parameters.options, {});
assert.equal(
  node("IF").parameters.conditions.string[0].value2,
  "REPLACE_WITH_EXISTING_META_VERIFY_TOKEN",
);

assert.equal(
  workflow.connections.Webhook1.main[0][0].node,
  "Preparar entrega Meta",
);
assert.equal(
  workflow.connections["Preparar entrega Meta"].main[0][0].node,
  "Guardar entrega antes do ACK",
);
assert.equal(
  workflow.connections["Guardar entrega antes do ACK"].main[0][0].node,
  "Restaurar entrega salva",
);
assert.equal(
  workflow.connections["Restaurar entrega salva"].main[0][0].node,
  "Responder 200",
);
assert.equal(
  workflow.connections["Responder 200"].main[0][0].node,
  "Normalizar payload oficial",
);

for (const removedName of [
  "Calcular assinatura Meta",
  "Validar assinatura Meta",
  "Assinatura valida?",
  "Marcar assinatura valida",
  "Marcar assinatura invalida",
  "Responder 401",
]) {
  assert.equal(hasNode(removedName), false);
  assert.equal(workflow.connections[removedName], undefined);
}

assert.equal(
  workflow.nodes.some((candidate) => candidate.credentials?.crypto),
  false,
);
assert.equal(hasNode("Assinando Webhook"), false);

const serializedWorkflow = JSON.stringify(workflow);
assert.doesNotMatch(
  serializedWorkflow,
  /Meta App Secret|x-hub-signature|signature_valid|expected_signature/i,
);

const inboxQuery = node("Guardar entrega antes do ACK").parameters.query;
assert.match(inboxQuery, /INSERT INTO wpptrack_webhook_inbox/);
assert.match(inboxQuery, /payload_text/);
assert.match(inboxQuery, /UTC_TIMESTAMP\(3\)/);
assert.doesNotMatch(
  inboxQuery,
  /signature_header|signature_valid|validated_at/,
);
assert.equal(node("Guardar entrega antes do ACK").retryOnFail, true);
assert.equal(node("Guardar entrega antes do ACK").maxTries, 5);
assert.equal(node("Responder 200").parameters.options.responseCode, 200);
assert.equal(node("Responder 200").parameters.responseBody, "EVENT_RECEIVED");
assert.match(
  node("Registrar conversation_started").parameters.query,
  /WHERE \$10 = 1/,
);
assert.match(
  node("Filter").parameters.conditions.conditions[0].leftValue,
  /ctwaclid/,
);
assert.equal(workflow.connections.Wait1.main[0][0].node, "Filter");
assert.equal(
  workflow.connections.Filter.main[0][0].node,
  "Inserir ou atualizar Lead no Banco",
);
assert.equal(
  workflow.connections["Inserir ou atualizar Lead no Banco"].main[0][0].node,
  "Acerta Fuso",
);
assert.deepEqual(
  workflow.connections["Modo de teste seguro?"].main.map(
    (branch) => branch[0]?.node,
  ),
  ["Resultado do teste seguro", "Registrar conversation_started"],
);
assert.equal(workflow.connections["Resultado do teste seguro"], undefined);

const timestamp = 1783728000;
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-synthetic",
      changes: [
        {
          field: "messages",
          value: {
            metadata: {
              phone_number_id: "123456789",
              display_phone_number: "+55 11 4000-0000",
            },
            contacts: [
              {
                wa_id: "5511999990001",
                user_id: "lead-synthetic",
                profile: { name: "Lead Teste" },
              },
            ],
            messages: [
              {
                id: "wamid.synthetic-paid",
                from: "5511999990001",
                from_user_id: "lead-synthetic",
                timestamp: String(timestamp),
                type: "text",
                text: { body: "Mensagem paga" },
                referral: {
                  ctwa_clid: "ctwa-synthetic",
                  source_id: "ad-synthetic",
                  source_url: "https://example.test/ad",
                  headline: "Anuncio teste",
                  thumbnail_url: "https://example.test/thumbnail.jpg",
                },
              },
              {
                id: "wamid.synthetic-organic",
                from: "5511999990001",
                timestamp: String(timestamp + 1),
                type: "text",
                text: { body: "Mensagem organica" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const prepared = await executeCode("Preparar entrega Meta", [
  {
    json: {
      headers: { "content-type": "application/json" },
      body: payload,
    },
  },
]);
assert.equal(prepared.length, 1);
assert.equal(prepared[0].json.body, payload);
assert.equal(prepared[0].json.payload_text, JSON.stringify(payload));
assert.equal(prepared[0].json.test_mode, false);
assert.match(
  prepared[0].json.delivery_key,
  /^meta:payload:[0-9a-f]{32}:[0-9]+$/,
);

const preparedRetry = await executeCode("Preparar entrega Meta", [
  { json: { body: JSON.parse(JSON.stringify(payload)) } },
]);
assert.equal(preparedRetry[0].json.delivery_key, prepared[0].json.delivery_key);

const safePayload = {
  ...JSON.parse(JSON.stringify(payload)),
  wpptrack_test_mode: true,
};
const preparedTest = await executeCode("Preparar entrega Meta", [
  { json: { body: safePayload } },
]);
assert.equal(preparedTest[0].json.test_mode, true);

await assert.rejects(
  executeCode("Preparar entrega Meta", [{ json: { body: null } }]),
  /body is missing/,
);

const normalized = await executeCode(
  "Normalizar payload oficial",
  [{ json: { affectedRows: 1 } }],
  (name) => {
    assert.equal(name, "Preparar entrega Meta");
    return { first: () => prepared[0] };
  },
);
assert.equal(normalized[0].json.events.length, 2);
assert.equal(normalized[0].json.events[0].ctwaclid, "ctwa-synthetic");
assert.equal(normalized[0].json.events[1].ctwaclid, "");
assert.equal(normalized[0].json.events[0].telefone, "5511999990001");
assert.equal(normalized[0].json.events[0].external_lead_id, "lead-synthetic");
assert.equal(
  normalized[0].json.events[0].thumbnail,
  "https://example.test/thumbnail.jpg",
);
assert.equal(normalized[0].json.events[0].test_mode, false);
assert.equal(
  normalized[0].json.events[0].delivery_key,
  prepared[0].json.delivery_key,
);
assert.match(
  normalized[0].json.events[0].dedupe_key,
  /^meta:conversation:123456789:wamid\.synthetic-paid$/,
);

const split = await executeCode("Separar mensagens", normalized);
assert.equal(split.length, 2);

const paidEvent = split[0].json;
const organicEvent = split[1].json;
const classified = await executeCode("Classificar inicio de conversa", [
  {
    json: {
      event_json: JSON.stringify(paidEvent),
      event_exists: 0,
      contact_exists: 1,
    },
  },
  {
    json: {
      event_json: JSON.stringify(organicEvent),
      event_exists: 0,
      contact_exists: 0,
    },
  },
  {
    json: {
      event_json: JSON.stringify(organicEvent),
      event_exists: 0,
      contact_exists: 1,
    },
  },
  {
    json: {
      event_json: JSON.stringify(paidEvent),
      event_exists: 1,
      contact_exists: 1,
    },
  },
]);

assert.equal(classified.length, 4);
assert.equal(classified[0].json.continue_legacy, true);
assert.equal(classified[1].json.continue_legacy, true);
assert.equal(classified[2].json.should_register, false);
assert.equal(classified[2].json.continue_legacy, false);
assert.equal(classified[3].json.event_exists, true);
assert.equal(classified[3].json.should_register, true);
assert.equal(classified[3].json.continue_legacy, false);

const continueLegacy = await executeCode(
  "Continuar fluxo legado",
  classified.map(() => ({ json: { affectedRows: 1 } })),
  (name) => {
    assert.equal(name, "Classificar inicio de conversa");
    return { all: () => classified };
  },
);
assert.equal(continueLegacy.length, 2);
assert.equal(
  continueLegacy.every((item) => item.json.continue_legacy),
  true,
);

const safeTestResult = await executeCode("Resultado do teste seguro", [
  {
    json: {
      ...classified[0].json,
      test_mode: true,
    },
  },
]);
assert.equal(safeTestResult[0].json.dry_run, true);
assert.equal(safeTestResult[0].json.would_register_event, true);
assert.equal(safeTestResult[0].json.would_send_legacy_capi, true);
assert.equal(safeTestResult[0].json.production_side_effects_executed, false);

const statusPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-synthetic",
      changes: [
        {
          field: "messages",
          value: { statuses: [{ id: "status" }] },
        },
      ],
    },
  ],
};
const preparedStatus = await executeCode("Preparar entrega Meta", [
  { json: { body: statusPayload } },
]);
const statusOnly = await executeCode(
  "Normalizar payload oficial",
  [{ json: { affectedRows: 1 } }],
  (name) => {
    assert.equal(name, "Preparar entrega Meta");
    return { first: () => preparedStatus[0] };
  },
);
assert.deepEqual(statusOnly[0].json.events, []);

console.log(
  JSON.stringify(
    {
      ok: true,
      workflow: workflow.name,
      scenarios: [
        "no_hmac_or_crypto_credential",
        "normal_json_body_without_binary",
        "durable_inbox_before_ack",
        "deterministic_delivery_retry_key",
        "batched_messages",
        "first_organic_contact",
        "ctwa_gate_before_legacy_write",
        "later_organic_message_ignored",
        "same_wamid_retry_ledger_only",
        "status_only_acknowledged",
        "paid_payload_safe_dry_run",
      ],
    },
    null,
    2,
  ),
);
