import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [outputPath] = process.argv.slice(2);

if (!outputPath) {
  throw new Error(
    "Usage: node build-meta-conversation-replay-test.mjs <output-workflow.json>",
  );
}

const syntheticPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-wpptrack-test",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+55 11 4000-0000",
              phone_number_id: "123456789000000",
            },
            contacts: [
              {
                profile: { name: "Lead Teste WppTrack" },
                wa_id: "5511999990001",
              },
            ],
            messages: [
              {
                from: "5511999990001",
                id: "wamid.wpptrack-safe-test",
                timestamp: "1783728000",
                type: "text",
                text: { body: "Teste seguro WppTrack" },
                referral: {
                  ctwa_clid: "ctwa-wpptrack-safe-test",
                  source_id: "ad-wpptrack-safe-test",
                  source_url: "https://example.test/wpptrack",
                  headline: "Anuncio teste WppTrack",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

function connection(node) {
  return { node, type: "main", index: 0 };
}

const workflow = {
  name: "WppTrack - Teste seguro Meta sem HMAC",
  nodes: [
    {
      parameters: {},
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      id: "a6903a64-7520-4b16-b804-370714a12b1e",
      name: "Executar teste seguro",
    },
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "7d3c8593-e6d1-4da4-a74f-287d7227bfda",
              name: "webhook_url",
              value: "REPLACE_WITH_ACTIVE_PRODUCTION_WEBHOOK_URL",
              type: "string",
            },
            {
              id: "187895b0-c163-4718-986f-87e702101dc8",
              name: "payload_json",
              value: JSON.stringify(syntheticPayload),
              type: "string",
            },
          ],
        },
        options: {},
      },
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [224, 0],
      id: "60457651-f6fc-4076-94af-bc3ddc814101",
      name: "Configurar replay",
    },
    {
      parameters: {
        jsCode: `const config = $input.first().json;
const webhookUrl = String(config.webhook_url || '').trim();
const payloadJson = String(config.payload_json || '').trim();

if (!webhookUrl.toLowerCase().startsWith('https://') || webhookUrl.includes('REPLACE_WITH_')) {
  throw new Error('Set the active production Webhook1 URL in Configurar replay');
}

let parsed;

try {
  parsed = JSON.parse(payloadJson);
} catch {
  throw new Error('payload_json is not valid JSON');
}

if (Array.isArray(parsed) && parsed.length === 1) {
  parsed = parsed[0];
}

const payload =
  parsed?.body?.object === 'whatsapp_business_account'
    ? parsed.body
    : parsed?.json?.body?.object === 'whatsapp_business_account'
      ? parsed.json.body
      : parsed;

if (!payload || payload.object !== 'whatsapp_business_account') {
  throw new Error('Paste an official Meta WhatsApp payload or its n8n body wrapper');
}

const safePayload = JSON.parse(JSON.stringify(payload));
safePayload.wpptrack_test_mode = true;

return [{
  json: {
    webhook_url: webhookUrl,
    raw_body: JSON.stringify(safePayload),
    test_mode: true,
  },
}];`,
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [448, 0],
      id: "87962f96-ce35-44a4-aa4d-c496b27e1e69",
      name: "Preparar payload de teste",
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $json.webhook_url }}",
        sendBody: true,
        contentType: "raw",
        rawContentType: "application/json",
        body: "={{ $json.raw_body }}",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [672, 0],
      id: "c61bd9dd-b87c-4bd3-aa82-a488236787ed",
      name: "Enviar replay ao webhook ativo",
    },
    {
      parameters: {
        content:
          "# Teste seguro\n\n1. Use a URL de producao do Webhook1 ativo.\n2. Cole um payload oficial Meta ou seu wrapper do n8n.\n3. O body recebe wpptrack_test_mode=true.\n4. Inbox e normalizacao executam; ledger, lead legado e CAPI nao executam.",
        height: 256,
        width: 576,
      },
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [320, -336],
      id: "0c361131-b2cd-4248-814c-aaf05f783176",
      name: "Como usar",
    },
  ],
  pinData: {},
  connections: {
    "Executar teste seguro": {
      main: [[connection("Configurar replay")]],
    },
    "Configurar replay": {
      main: [[connection("Preparar payload de teste")]],
    },
    "Preparar payload de teste": {
      main: [[connection("Enviar replay ao webhook ativo")]],
    },
  },
  active: false,
  settings: {
    executionOrder: "v1",
    binaryMode: "separate",
    availableInMCP: false,
  },
  meta: {
    templateCredsSetupCompleted: false,
  },
  nodeGroups: [],
  tags: [],
};

for (const node of workflow.nodes) {
  if (node.type === "n8n-nodes-base.code") {
    new Function(`return (async () => {\n${node.parameters.jsCode}\n});`);
  }
}

const serialized = JSON.stringify(workflow);

if (/Bearer EAA|hmacSecret|app_secret/i.test(serialized)) {
  throw new Error("The replay artifact contains a forbidden secret fragment");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      workflowName: workflow.name,
      active: workflow.active,
      nodeCount: workflow.nodes.length,
      safeMarkerAddedToBody: true,
      signatureValidation: false,
      productionSideEffectNodes: 0,
    },
    null,
    2,
  ),
);
