import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node build-meta-conversation-dual-write.mjs <source-workflow.json> <output-workflow.json>",
  );
}

const workflow = JSON.parse(await readFile(inputPath, "utf8"));

function requireNode(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);

  if (!node) {
    throw new Error(`Required node not found: ${name}`);
  }

  return node;
}

function isConnected(name) {
  if (workflow.connections[name]) {
    return true;
  }

  return Object.values(workflow.connections).some((outputs) =>
    (outputs.main ?? []).some((branch) =>
      branch.some((connection) => connection.node === name),
    ),
  );
}

function connection(node, index = 0) {
  return { node, type: "main", index };
}

function setPosition(node, x, y) {
  node.position = [x, y];
}

const getWebhook = requireNode("Webhook");
const verifyTokenIf = requireNode("IF");
const getResponse = requireNode("Respond to Webhook");
const postWebhook = requireNode("Webhook1");
const unsafeSubscriptionNode = requireNode("Assinando Webhook");
const editFields = requireNode("Edit Fields");
const paidFilter = requireNode("Filter");
const legacyUpsert = requireNode("Inserir ou atualizar Lead no Banco");
const timezoneNode = requireNode("Acerta Fuso");
const timestampNode = requireNode("Gera Timestamp");
const phoneHashNode = requireNode("[HASH] Phone1");
const tokenLookupNode = requireNode("Buscar tokens");
const loopNode = requireNode("Loop Over Items");
const pixelLookupNode = requireNode("Busca Pixel");
const pixelFilterNode = requireNode("Filtra page_id e pixel_id");
const metaLeadNode = requireNode("Envia convers\u00e3o de Lead");
const legacyStatusNode = requireNode("atualizar dados");
const legacyUpdateNode = requireNode("atualiza\u00e7\u00e3o lead no banco");
const waitNode = requireNode("Wait1");

if (isConnected(unsafeSubscriptionNode.name)) {
  throw new Error(
    "Refusing to remove Assinando Webhook because the inline-token node is connected",
  );
}

const verifyCondition = verifyTokenIf.parameters?.conditions?.string?.[0];

if (!verifyCondition?.value2) {
  throw new Error("The GET webhook verification token condition was not found");
}

const originalVerifyToken = verifyCondition.value2;

if (
  legacyUpsert.parameters?.table?.value !== "whatsapp_anuncio_barbieri" ||
  tokenLookupNode.parameters?.table?.value !== "contas_anuncio_barbieri"
) {
  throw new Error("The source workflow is not the Barbieri Meta workflow");
}

const mysqlCredentials = structuredClone(legacyUpsert.credentials);
const originalWebhookPath = postWebhook.parameters.path;

if (
  !originalWebhookPath ||
  getWebhook.parameters.path !== originalWebhookPath
) {
  throw new Error(
    "GET and POST webhook paths must match before transformation",
  );
}

verifyCondition.value2 = "REPLACE_WITH_EXISTING_META_VERIFY_TOKEN";

postWebhook.typeVersion = 2.1;
postWebhook.parameters = {
  httpMethod: "POST",
  path: originalWebhookPath,
  responseMode: "responseNode",
  options: {
    rawBody: true,
  },
};

editFields.parameters = {
  assignments: {
    assignments: [
      {
        id: "cb2a4ca6-246f-4b7c-a4a9-c03175185ff2",
        name: "data_criacao",
        value: "={{ $json.event_local_date }}",
        type: "string",
      },
      {
        id: "4ca0aa2c-d5e5-4ba7-a3f2-a950f9930bda",
        name: "cta",
        value: '={{ $json.cta || "" }}',
        type: "string",
      },
      {
        id: "1580785e-cad7-47ea-a48c-d8cd9b50c771",
        name: "ctwaclid",
        value: '={{ $json.ctwaclid || "" }}',
        type: "string",
      },
      {
        id: "0d8191c5-fd19-4618-a7b9-fb11b3ab195f",
        name: "source_url",
        value: '={{ $json.source_url || "" }}',
        type: "string",
      },
      {
        id: "ea5e6304-0f4e-4e29-ad16-d6101db8a835",
        name: "source_id",
        value: '={{ $json.source_id || "" }}',
        type: "string",
      },
      {
        id: "20d1fb1d-e77a-46e3-966d-55108039dabd",
        name: "nome",
        value: '={{ $json.nome || "" }}',
        type: "string",
      },
      {
        id: "8ec1ec27-1ce7-4df1-b734-153f277912c5",
        name: "thumbnail",
        value: '={{ $json.thumbnail || "" }}',
        type: "string",
      },
      {
        id: "4a8c496d-a149-439b-a858-73adbb639152",
        name: "telefone",
        value: "={{ $json.telefone }}",
        type: "string",
      },
      {
        id: "8fd78f0f-147b-4bf2-9b2d-685ed753926c",
        name: "Mensagem",
        value: '={{ $json.Mensagem || "" }}',
        type: "string",
      },
      {
        id: "9af0d16f-7a2a-4b9a-b450-9609b5948c15",
        name: "status",
        value: "Entrou em contato",
        type: "string",
      },
      {
        id: "bd7585a1-0978-42ea-9019-9af6f71de0c7",
        name: "lid",
        value: "={{ $json.external_lead_id || $json.telefone }}",
        type: "string",
      },
    ],
  },
  options: {},
};

paidFilter.parameters.conditions.conditions[0].leftValue =
  '={{ $node["Edit Fields"].json["ctwaclid"] }}';

pixelLookupNode.retryOnFail = true;
pixelLookupNode.waitBetweenTries = 5000;
pixelLookupNode.onError = "continueErrorOutput";

const eventIdLine =
  '      "event_name": "LeadSubmitted",\n      "event_time": {{ $node["Gera Timestamp"].json["formattedDate"] }},';
const eventIdReplacement =
  '      "event_name": "LeadSubmitted",\n      "event_time": {{ $node["Gera Timestamp"].json["formattedDate"] }},\n      "event_id": "lead_{{ $node["Classificar inicio de conversa"].json["wamid"] }}",';

if (!metaLeadNode.parameters.jsonBody.includes(eventIdLine)) {
  throw new Error("The expected legacy LeadSubmitted payload was not found");
}

metaLeadNode.parameters.jsonBody = metaLeadNode.parameters.jsonBody.replace(
  eventIdLine,
  eventIdReplacement,
);

const captureRawBodyNode = {
  parameters: {
    jsCode: `const items = $input.all();
const output = [];

for (const [index, item] of items.entries()) {
  if (!item.binary?.data) {
    throw new Error(
      'Raw body binary data is missing. Trigger this flow through Webhook1 with Raw Body enabled; do not execute the Crypto node manually.',
    );
  }

  const rawBodyBuffer = await this.helpers.getBinaryDataBuffer(index, 'data');
  const rawBody = rawBodyBuffer.toString('utf8');

  if (!rawBody) {
    throw new Error('Official Meta webhook raw body is empty');
  }

  const headers = item.json.headers || {};
  const receivedSignature = String(
    headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'] || '',
  ).trim().toLowerCase();
  const deliveryKey = /^sha256=[0-9a-f]{64}$/.test(receivedSignature)
    ? \`meta:\${receivedSignature.slice(7)}\`
    : \`meta:unverified:\${Date.now().toString(36)}:\${index}\`;

  output.push({
    json: {
      ...item.json,
      raw_body: rawBody,
      received_signature: receivedSignature,
      delivery_key: deliveryKey,
    },
    binary: item.binary,
    pairedItem: { item: index },
  });
}

return output;`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [544, 576],
  id: "435339fc-da2c-477d-a62e-e202ce1e975d",
  name: "Preservar body bruto",
};

const signatureNode = {
  parameters: {
    action: "hmac",
    binaryData: true,
    binaryPropertyName: "data",
    type: "SHA256",
    dataPropertyName: "expected_signature",
    encoding: "hex",
  },
  type: "n8n-nodes-base.crypto",
  typeVersion: 2,
  position: [1216, 576],
  id: "67b5ff0d-85b4-4a10-995e-b0c068b8d657",
  name: "Calcular assinatura Meta",
  credentials: {
    crypto: {
      name: "Meta App Secret (HMAC)",
    },
  },
};

const validateSignatureNode = {
  parameters: {
    jsCode: `const item = $input.first();
const headers = item.json.headers || {};
const received = String(item.json.received_signature || '').trim().toLowerCase();
const digest = String(item.json.expected_signature || '').trim().toLowerCase();
const expected = \`sha256=\${digest}\`;
const comparisonLength = Math.max(received.length, expected.length, 71);
let mismatch = received.length ^ expected.length;

for (let index = 0; index < comparisonLength; index += 1) {
  mismatch |= (received.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
}

const signatureValid =
  /^sha256=[0-9a-f]{64}$/.test(received) &&
  /^[0-9a-f]{64}$/.test(digest) &&
  mismatch === 0;
let signedBody;

try {
  signedBody = JSON.parse(String(item.json.raw_body || ''));
} catch {
  signedBody = undefined;
}

const output = {
  ...item.json,
  signature_valid: signatureValid,
  test_mode: signatureValid && signedBody?.wpptrack_test_mode === true,
};

delete output.expected_signature;

return [{ json: output }];`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1440, 576],
  id: "15ab9148-90fc-46ec-9661-e67211bd7afc",
  name: "Validar assinatura Meta",
};

const signatureIfNode = {
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "strict",
        version: 2,
      },
      conditions: [
        {
          id: "1422ec0a-22d8-4695-a217-379d77fdf77c",
          leftValue: "={{ $json.signature_valid }}",
          rightValue: "",
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true,
          },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [1664, 576],
  id: "b59854dd-ed30-4ae7-8bb3-92f878f57756",
  name: "Assinatura valida?",
};

const storeDeliveryNode = {
  parameters: {
    operation: "executeQuery",
    query: `INSERT INTO wpptrack_webhook_inbox (
  delivery_key,
  provider,
  signature_header,
  signature_valid,
  payload_text,
  is_test,
  created_at,
  updated_at
) VALUES (
  $1,
  'meta_whatsapp_official',
  $2,
  NULL,
  $3,
  0,
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  signature_header = VALUES(signature_header),
  payload_text = VALUES(payload_text),
  updated_at = UTC_TIMESTAMP(3);`,
    options: {
      queryReplacement:
        "={{ [$json.delivery_key, $json.received_signature || null, $json.raw_body] }}",
    },
  },
  type: "n8n-nodes-base.mySql",
  typeVersion: 2.5,
  position: [768, 576],
  id: "1c8bc953-8580-4ed2-a824-97bc9b92bd74",
  name: "Capturar entrega antes da validacao",
  retryOnFail: true,
  maxTries: 5,
  waitBetweenTries: 2000,
  credentials: structuredClone(mysqlCredentials),
};

const restoreCapturedDeliveryNode = {
  parameters: {
    jsCode: `const captured = $('Preservar body bruto').all();

return captured.map((item, index) => ({
  json: item.json,
  binary: item.binary,
  pairedItem: { item: index },
}));`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [992, 576],
  id: "0ccb9b07-1015-4fd9-b4fd-430e38f11911",
  name: "Restaurar entrega capturada",
};

const markValidDeliveryNode = {
  parameters: {
    operation: "executeQuery",
    query: `UPDATE wpptrack_webhook_inbox
SET
  signature_valid = 1,
  is_test = $2,
  validated_at = UTC_TIMESTAMP(3),
  updated_at = UTC_TIMESTAMP(3)
WHERE delivery_key = $1;`,
    options: {
      queryReplacement: "={{ [$json.delivery_key, $json.test_mode ? 1 : 0] }}",
    },
  },
  type: "n8n-nodes-base.mySql",
  typeVersion: 2.5,
  position: [1888, 496],
  id: "d5bd73da-37ea-442c-af97-b1c31f13a7ab",
  name: "Marcar assinatura valida",
  credentials: structuredClone(mysqlCredentials),
};

const markInvalidDeliveryNode = {
  parameters: {
    operation: "executeQuery",
    query: `UPDATE wpptrack_webhook_inbox
SET
  signature_valid = 0,
  is_test = 0,
  validated_at = UTC_TIMESTAMP(3),
  updated_at = UTC_TIMESTAMP(3)
WHERE delivery_key = $1;`,
    options: {
      queryReplacement: "={{ [$json.delivery_key] }}",
    },
  },
  type: "n8n-nodes-base.mySql",
  typeVersion: 2.5,
  position: [1888, 752],
  id: "0e6258ab-d2cb-46b5-92a6-31e46698003a",
  name: "Marcar assinatura invalida",
  credentials: structuredClone(mysqlCredentials),
};

const unauthorizedResponseNode = {
  parameters: {
    respondWith: "text",
    responseBody: "Unauthorized",
    options: {
      responseCode: 401,
    },
  },
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.4,
  position: [2112, 752],
  id: "6f8fd94b-04bd-4922-ab12-1bfac79ab9cc",
  name: "Responder 401",
};

const normalizePayloadNode = {
  parameters: {
    jsCode: `const input = $('Validar assinatura Meta').first().json;
let body = input.raw_body;

if (typeof body === 'string') {
  try {
    body = JSON.parse(body);
  } catch {
    throw new Error('Meta webhook body is not valid JSON');
  }
}

if (!body || body.object !== 'whatsapp_business_account') {
  throw new Error('Unexpected Meta webhook object');
}

function digits(value) {
  return String(value || '').replace(/\\D/g, '');
}

function messageText(message) {
  return String(
    message.text?.body ||
      message.button?.text ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      message.image?.caption ||
      message.video?.caption ||
      message.document?.caption ||
      '',
  );
}

const events = [];

for (const entry of body.entry || []) {
  for (const change of entry.changes || []) {
    const value = change.value || {};
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    const contactsByPhone = new Map(
      contacts.map((contact) => [digits(contact.wa_id), contact]),
    );

    for (const message of value.messages || []) {
      const telefone = digits(message.from || contacts[0]?.wa_id);
      const contact = contactsByPhone.get(telefone) || contacts[0] || {};
      const wamid = String(message.id || '').trim();
      const timestampSeconds = Number(message.timestamp);
      const occurredAt = DateTime.fromSeconds(timestampSeconds, { zone: 'utc' });

      if (!wamid || !telefone || !Number.isFinite(timestampSeconds) || !occurredAt.isValid) {
        throw new Error('Official Meta message is missing wamid, phone or timestamp');
      }

      const referral = message.referral || {};
      const connectedNumber = String(
        value.metadata?.phone_number_id ||
          digits(value.metadata?.display_phone_number) ||
          entry.id ||
          'unknown',
      ).replace(/[^A-Za-z0-9_.-]/g, '');
      const dedupeKey = \`meta:conversation:\${connectedNumber || 'unknown'}:\${wamid}\`;

      if (dedupeKey.length > 255) {
        throw new Error('Official Meta conversation dedupe key exceeds 255 characters');
      }

      events.push({
        delivery_key: input.delivery_key,
        test_mode: input.test_mode === true,
        dedupe_key: dedupeKey,
        wamid,
        phone_number_id: connectedNumber || 'unknown',
        telefone,
        external_lead_id: String(
          message.from_user_id || contact.user_id || contact.wa_id || telefone,
        ),
        occurred_at_utc: occurredAt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss.SSS'),
        event_local_date: occurredAt
          .setZone('America/Sao_Paulo')
          .toFormat('yyyy-MM-dd'),
        ctwaclid: String(referral.ctwa_clid || ''),
        source_id: String(referral.source_id || ''),
        source_url: String(referral.source_url || ''),
        nome: String(contact.profile?.name || ''),
        cta: String(referral.headline || ''),
        thumbnail: String(referral.image_url || referral.thumbnail_url || ''),
        Mensagem: messageText(message),
      });
    }
  }
}

return [{
  json: {
    delivery_key: input.delivery_key,
    test_mode: input.test_mode === true,
    events,
  },
}];`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2336, 496],
  id: "81adf284-30db-4835-a56a-4f01116e7e6f",
  name: "Normalizar payload oficial",
};

const acceptedResponseNode = {
  parameters: {
    respondWith: "text",
    responseBody: "EVENT_RECEIVED",
    options: {
      responseCode: 200,
    },
  },
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.4,
  position: [2560, 496],
  id: "82fc1ce3-2bfe-428c-aeee-49aa832df1ee",
  name: "Responder 200",
};

const splitMessagesNode = {
  parameters: {
    jsCode: `const events = $input.first().json.events;

if (!Array.isArray(events)) {
  throw new Error('Normalized Meta events are not an array');
}

return events.map((event) => ({ json: event }));`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2112, 496],
  id: "9e9480b9-a2ef-43f2-a99b-9800c1862d67",
  name: "Separar mensagens",
};

const paidTrafficGateNode = {
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "strict",
        version: 2,
      },
      conditions: [
        {
          id: "cd28a379-9d9e-4da3-99c2-22a322272535",
          leftValue: '={{ String($json.ctwaclid || "").trim() }}',
          rightValue: "",
          operator: {
            type: "string",
            operation: "notEmpty",
            singleValue: true,
          },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  type: "n8n-nodes-base.filter",
  typeVersion: 2.2,
  position: [2784, 496],
  id: "f67d7b40-b7eb-4ca2-85ec-596f33b84216",
  name: "Somente mensagens com CTWA",
};

const historyLookupNode = {
  parameters: {
    operation: "executeQuery",
    query: `SELECT
  $1 AS event_json,
  EXISTS (
    SELECT 1
    FROM wpptrack_tracking_events
    WHERE dedupe_key = $2
    LIMIT 1
  ) AS event_exists,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM whatsapp_anuncio_barbieri
      WHERE telefone = $3
      LIMIT 1
    ) OR EXISTS (
      SELECT 1
      FROM wpptrack_tracking_events
      WHERE provider = 'meta_whatsapp_official'
        AND event_type = 'conversation_started'
        AND phone = $3
      LIMIT 1
    ) THEN 1
    ELSE 0
  END AS contact_exists;`,
    options: {
      queryReplacement:
        "={{ [JSON.stringify($json), $json.dedupe_key, $json.telefone] }}",
    },
  },
  type: "n8n-nodes-base.mySql",
  typeVersion: 2.5,
  position: [2784, 496],
  id: "45ad9861-6c59-43df-9df6-98d1f036dd6c",
  name: "Buscar historico da conversa",
  credentials: structuredClone(mysqlCredentials),
};

const classifyConversationNode = {
  parameters: {
    jsCode: `const output = [];

for (const [index, item] of $input.all().entries()) {
  let event = item.json.event_json;

  if (typeof event === 'string') {
    event = JSON.parse(event);
  }

  if (!event || typeof event !== 'object') {
    throw new Error('Conversation lookup did not preserve the normalized event');
  }

  const eventExists = Number(item.json.event_exists || 0) === 1;
  const contactExists = Number(item.json.contact_exists || 0) === 1;
  const hasPaidAttribution = Boolean(String(event.ctwaclid || '').trim());
  const shouldRegister = eventExists || hasPaidAttribution;

  output.push({
    json: {
      ...event,
      event_exists: eventExists,
      contact_exists: contactExists,
      should_register: shouldRegister,
      continue_legacy: shouldRegister && !eventExists,
    },
    pairedItem: { item: index },
  });
}

return output;`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3008, 496],
  id: "613c9677-59e9-4311-985b-95b0f9820374",
  name: "Classificar inicio de conversa",
};

const testModeIfNode = {
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "strict",
        version: 2,
      },
      conditions: [
        {
          id: "e4f87d61-75d0-40da-a55b-fc9ca76fd3a9",
          leftValue: "={{ $json.test_mode }}",
          rightValue: "",
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true,
          },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [3232, 496],
  id: "3285e28f-cfa1-4d96-ac50-5fb85c756a38",
  name: "Modo de teste seguro?",
};

const safeTestResultNode = {
  parameters: {
    jsCode: `return $input.all().map((item, index) => {
  const event = item.json;

  return {
    json: {
      dry_run: true,
      safe_to_process: true,
      delivery_key: event.delivery_key,
      event_type: 'conversation_started',
      dedupe_key: event.dedupe_key,
      external_event_id: event.wamid,
      phone: event.telefone,
      paid_attribution: Boolean(String(event.ctwaclid || '').trim()),
      would_register_event: event.should_register === true,
      would_increment_duplicate: event.event_exists === true,
      would_upsert_legacy_lead: event.continue_legacy === true,
      would_send_legacy_capi:
        event.continue_legacy === true &&
        Boolean(String(event.ctwaclid || '').trim()),
      production_side_effects_executed: false,
    },
    pairedItem: { item: index },
  };
});`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3456, 736],
  id: "1d7239ea-4aeb-4c10-a32a-d34f01731aa3",
  name: "Resultado do teste seguro",
};

const registerConversationNode = {
  parameters: {
    operation: "executeQuery",
    query: `INSERT INTO wpptrack_tracking_events (
  dedupe_key,
  provider,
  event_type,
  source_event_name,
  external_event_id,
  external_lead_id,
  phone,
  occurred_at,
  event_local_date,
  ad_id,
  ctwa_clid,
  source_url
)
SELECT
  $1,
  'meta_whatsapp_official',
  'conversation_started',
  'messages',
  $2,
  NULLIF($3, ''),
  $4,
  $5,
  $6,
  NULLIF($7, ''),
  NULLIF($8, ''),
  NULLIF($9, '')
FROM DUAL
WHERE $10 = 1
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  updated_at = UTC_TIMESTAMP(3);`,
    options: {
      queryReplacement:
        '={{ [\n  $json.dedupe_key,\n  $json.wamid,\n  $json.external_lead_id || $json.telefone,\n  $json.telefone,\n  $json.occurred_at_utc,\n  $json.event_local_date,\n  $json.source_id || "",\n  $json.ctwaclid || "",\n  $json.source_url || "",\n  $json.should_register ? 1 : 0\n] }}',
    },
  },
  type: "n8n-nodes-base.mySql",
  typeVersion: 2.5,
  position: [3456, 496],
  id: "8fac4be3-d538-40a3-958c-c6766fbab00f",
  name: "Registrar conversation_started",
  credentials: structuredClone(mysqlCredentials),
};

const continueLegacyNode = {
  parameters: {
    jsCode: `const classified = $('Classificar inicio de conversa').all();

return $input.all().flatMap((item, index) => {
  const event = classified[index]?.json;

  if (!event) {
    throw new Error('Registered event lost its normalized conversation context');
  }

  if (!event.continue_legacy) {
    return [];
  }

  return [{ json: event, pairedItem: { item: index } }];
});`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3680, 496],
  id: "c78868c0-e813-44b0-b9be-d5c7247fc86e",
  name: "Continuar fluxo legado",
};

const stickyNote = {
  parameters: {
    content: `# Meta Oficial -> WppTrack

1. O body bruto e preservado e validado com HMAC-SHA256.
2. Toda entrega e capturada antes do HMAC; assinatura invalida fica em quarentena no inbox.
3. Apenas entregas validas recebem ACK 200 e seguem para processamento.
4. wpptrack_test_mode dentro do body assinado executa um dry-run sem efeitos de producao.
5. Cada messages[].id gera no maximo um conversation_started.
6. Retries incrementam duplicate_count e nao repetem o fluxo legado.
7. Apenas mensagens com CTWA passam para historico, ledger e lead.
8. O envio LeadSubmitted do n8n fica desconectado; Conversas pertencem ao WppTrack.`,
    height: 336,
    width: 1104,
  },
  type: "n8n-nodes-base.stickyNote",
  position: [1600, 80],
  typeVersion: 1,
  id: "6f49f39a-3ebd-4eeb-bba0-7ac393778c12",
  name: "Contrato Meta Oficial WppTrack",
};

workflow.nodes = workflow.nodes.filter(
  (node) => node.name !== unsafeSubscriptionNode.name,
);
workflow.nodes.push(
  captureRawBodyNode,
  storeDeliveryNode,
  restoreCapturedDeliveryNode,
  signatureNode,
  validateSignatureNode,
  signatureIfNode,
  markValidDeliveryNode,
  markInvalidDeliveryNode,
  unauthorizedResponseNode,
  normalizePayloadNode,
  acceptedResponseNode,
  splitMessagesNode,
  paidTrafficGateNode,
  historyLookupNode,
  classifyConversationNode,
  testModeIfNode,
  safeTestResultNode,
  registerConversationNode,
  continueLegacyNode,
  stickyNote,
);

setPosition(postWebhook, 320, 576);
setPosition(historyLookupNode, 3008, 496);
setPosition(classifyConversationNode, 3232, 496);
setPosition(testModeIfNode, 3456, 496);
setPosition(safeTestResultNode, 3680, 736);
setPosition(registerConversationNode, 3680, 496);
setPosition(continueLegacyNode, 3904, 496);
setPosition(editFields, 4128, 496);
setPosition(waitNode, 4352, 496);
setPosition(paidFilter, 4576, 496);
setPosition(legacyUpsert, 4800, 496);
setPosition(timezoneNode, 5024, 496);
setPosition(timestampNode, 5248, 496);
setPosition(phoneHashNode, 5472, 496);
setPosition(tokenLookupNode, 5696, 496);
setPosition(loopNode, 5920, 496);
setPosition(pixelLookupNode, 6144, 512);
setPosition(pixelFilterNode, 6368, 496);
setPosition(metaLeadNode, 5696, 256);
setPosition(legacyStatusNode, 5696, 496);
setPosition(legacyUpdateNode, 5920, 496);

workflow.connections = {
  Webhook: {
    main: [[connection("IF")]],
  },
  IF: {
    main: [[connection("Respond to Webhook")]],
  },
  Webhook1: {
    main: [[connection("Preservar body bruto")]],
  },
  "Preservar body bruto": {
    main: [[connection("Capturar entrega antes da validacao")]],
  },
  "Capturar entrega antes da validacao": {
    main: [[connection("Restaurar entrega capturada")]],
  },
  "Restaurar entrega capturada": {
    main: [[connection("Calcular assinatura Meta")]],
  },
  "Calcular assinatura Meta": {
    main: [[connection("Validar assinatura Meta")]],
  },
  "Validar assinatura Meta": {
    main: [[connection("Assinatura valida?")]],
  },
  "Assinatura valida?": {
    main: [
      [connection("Marcar assinatura valida")],
      [connection("Marcar assinatura invalida")],
    ],
  },
  "Marcar assinatura valida": {
    main: [[connection("Responder 200")]],
  },
  "Marcar assinatura invalida": {
    main: [[connection("Responder 401")]],
  },
  "Responder 200": {
    main: [[connection("Normalizar payload oficial")]],
  },
  "Normalizar payload oficial": {
    main: [[connection("Separar mensagens")]],
  },
  "Separar mensagens": {
    main: [[connection("Somente mensagens com CTWA")]],
  },
  "Somente mensagens com CTWA": {
    main: [[connection("Buscar historico da conversa")]],
  },
  "Buscar historico da conversa": {
    main: [[connection("Classificar inicio de conversa")]],
  },
  "Classificar inicio de conversa": {
    main: [[connection("Modo de teste seguro?")]],
  },
  "Modo de teste seguro?": {
    main: [
      [connection("Resultado do teste seguro")],
      [connection("Registrar conversation_started")],
    ],
  },
  "Registrar conversation_started": {
    main: [[connection("Continuar fluxo legado")]],
  },
  "Continuar fluxo legado": {
    main: [[connection("Edit Fields")]],
  },
  "Edit Fields": {
    main: [[connection("Wait1")]],
  },
  Wait1: {
    main: [[connection("Filter")]],
  },
  Filter: {
    main: [[connection("Inserir ou atualizar Lead no Banco")]],
  },
  "Inserir ou atualizar Lead no Banco": {
    main: [[connection("Acerta Fuso")]],
  },
  "Acerta Fuso": {
    main: [[connection("Gera Timestamp")]],
  },
  "Gera Timestamp": {
    main: [[connection("[HASH] Phone1")]],
  },
  "[HASH] Phone1": {
    main: [[connection("Buscar tokens")]],
  },
  "Buscar tokens": {
    main: [[connection("Loop Over Items")]],
  },
  "Loop Over Items": {
    main: [[], [connection("Busca Pixel")]],
  },
  "Busca Pixel": {
    main: [
      [connection("Filtra page_id e pixel_id")],
      [connection("Loop Over Items")],
    ],
  },
  "Filtra page_id e pixel_id": {
    main: [[connection("atualizar dados")]],
  },
  "atualizar dados": {
    main: [[connection(legacyUpdateNode.name)]],
  },
};

for (const node of workflow.nodes) {
  delete node.webhookId;

  for (const credential of Object.values(node.credentials ?? {})) {
    delete credential.id;
  }
}

workflow.name = `${workflow.name} - conversation dual-write WppTrack - pre-validation inbox`;
workflow.active = false;
workflow.pinData = {};

delete workflow.id;
delete workflow.versionId;

if (workflow.meta) {
  delete workflow.meta.instanceId;
  workflow.meta.templateCredsSetupCompleted = false;
}

const nodeNames = workflow.nodes.map((node) => node.name);
const nodeNameSet = new Set(nodeNames);
const nodeIds = workflow.nodes.map((node) => node.id).filter(Boolean);

if (nodeNameSet.size !== nodeNames.length) {
  throw new Error("The generated workflow contains duplicate node names");
}

if (new Set(nodeIds).size !== nodeIds.length) {
  throw new Error("The generated workflow contains duplicate node IDs");
}

for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
  if (!nodeNameSet.has(sourceName)) {
    throw new Error(`Connection source does not exist: ${sourceName}`);
  }

  for (const branch of outputs.main ?? []) {
    for (const target of branch) {
      if (!nodeNameSet.has(target.node)) {
        throw new Error(`Connection target does not exist: ${target.node}`);
      }
    }
  }
}

for (const node of workflow.nodes) {
  if (node.type === "n8n-nodes-base.code") {
    // n8n wraps Code-node source in an async function at runtime.
    new Function(`return (async () => {\n${node.parameters.jsCode}\n});`);
  }

  if (node.webhookId) {
    throw new Error(`Internal webhook ID remained on node: ${node.name}`);
  }

  for (const credential of Object.values(node.credentials ?? {})) {
    if (credential.id) {
      throw new Error(`Internal credential ID remained on node: ${node.name}`);
    }
  }
}

if (
  workflow.active !== false ||
  Object.keys(workflow.pinData).length !== 0 ||
  workflow.id ||
  workflow.versionId
) {
  throw new Error("The generated workflow is not safe for an inactive import");
}

const serialized = JSON.stringify(workflow);
const forbiddenFragments = ["Bearer EAA", originalVerifyToken].filter(Boolean);

for (const fragment of forbiddenFragments) {
  if (serialized.includes(fragment)) {
    throw new Error("A production secret remained in the sanitized workflow");
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");

const removeSignatureScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "remove-meta-signature-validation.mjs",
);
await execFileAsync(process.execPath, [
  removeSignatureScript,
  outputPath,
  outputPath,
]);
const finalWorkflow = JSON.parse(await readFile(outputPath, "utf8"));

console.log(
  JSON.stringify(
    {
      outputPath,
      workflowName: finalWorkflow.name,
      active: finalWorkflow.active,
      nodeCount: finalWorkflow.nodes.length,
      pinDataKeys: Object.keys(finalWorkflow.pinData).length,
      normalJsonBodyEnabled:
        finalWorkflow.nodes.find((node) => node.name === "Webhook1").parameters
          .options.rawBody !== true,
      durableInboxBeforeAck:
        finalWorkflow.connections["Guardar entrega antes do ACK"].main[0][0]
          .node === "Restaurar entrega salva" &&
        finalWorkflow.connections["Restaurar entrega salva"].main[0][0].node ===
          "Responder 200",
      safeDryRunEnabled:
        finalWorkflow.connections["Modo de teste seguro?"].main[0][0].node ===
        "Resultado do teste seguro",
      removedInlineTokenNode: !finalWorkflow.nodes.some(
        (node) => node.name === unsafeSubscriptionNode.name,
      ),
      signatureValidation: false,
      verifyTokenIsPlaceholder:
        verifyCondition.value2 === "REPLACE_WITH_EXISTING_META_VERIFY_TOKEN",
    },
    null,
    2,
  ),
);
