import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node remove-meta-signature-validation.mjs <input-workflow.json> <output-workflow.json>",
  );
}

const workflow = JSON.parse(await readFile(inputPath, "utf8"));

function requireNode(...names) {
  const found = workflow.nodes.find((candidate) =>
    names.includes(candidate.name),
  );

  if (!found) {
    throw new Error(`Node not found: ${names.join(" or ")}`);
  }

  return found;
}

function connection(node, index = 0) {
  return { node, type: "main", index };
}

function setPosition(name, x, y) {
  requireNode(name).position = [x, y];
}

const postWebhook = requireNode("Webhook1");
postWebhook.parameters.options = {};

const prepare = requireNode("Preservar body bruto", "Preparar entrega Meta");
prepare.name = "Preparar entrega Meta";
prepare.position = [544, 576];
prepare.parameters.jsCode = `const items = $input.all();

function hash32(value, seed) {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

return items.map((item, index) => {
  const body = item.json.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Meta webhook body is missing or is not a JSON object');
  }

  const payloadText = JSON.stringify(body);
  const payloadHash = [
    hash32(payloadText, 0x811c9dc5),
    hash32(payloadText, 0x9e3779b9),
    hash32(payloadText, 0x85ebca6b),
    hash32(payloadText, 0xc2b2ae35),
  ].join('');

  return {
    json: {
      ...item.json,
      delivery_key: \`meta:payload:\${payloadHash}:\${payloadText.length}\`,
      payload_text: payloadText,
      test_mode: body.wpptrack_test_mode === true,
    },
    pairedItem: { item: index },
  };
});`;

const store = requireNode(
  "Capturar entrega antes da validacao",
  "Guardar entrega antes do ACK",
);
store.name = "Guardar entrega antes do ACK";
store.position = [768, 576];
store.parameters.query = `INSERT INTO wpptrack_webhook_inbox (
  delivery_key,
  provider,
  payload_text,
  is_test,
  created_at,
  updated_at
) VALUES (
  $1,
  'meta_whatsapp_official',
  $2,
  $3,
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  payload_text = VALUES(payload_text),
  is_test = VALUES(is_test),
  updated_at = UTC_TIMESTAMP(3);`;
store.parameters.options.queryReplacement =
  "={{ [$json.delivery_key, $json.payload_text, $json.test_mode ? 1 : 0] }}";

const restore = requireNode(
  "Restaurar entrega capturada",
  "Restaurar entrega salva",
);
restore.name = "Restaurar entrega salva";
restore.position = [992, 576];
restore.parameters.jsCode = `const prepared = $('Preparar entrega Meta').all();

return prepared.map((item, index) => ({
  json: item.json,
  pairedItem: { item: index },
}));`;

const normalize = requireNode("Normalizar payload oficial");
const functionsStart = normalize.parameters.jsCode.indexOf(
  "function digits(value)",
);

if (functionsStart < 0) {
  throw new Error("Could not locate the Meta normalization functions");
}

normalize.parameters.jsCode = `const input = $('Preparar entrega Meta').first().json;
const body = input.body;

if (!body || body.object !== 'whatsapp_business_account') {
  throw new Error('Unexpected Meta webhook object');
}

${normalize.parameters.jsCode.slice(functionsStart)}`;

const removedNames = new Set([
  "Calcular assinatura Meta",
  "Validar assinatura Meta",
  "Assinatura valida?",
  "Marcar assinatura valida",
  "Marcar assinatura invalida",
  "Responder 401",
]);

workflow.nodes = workflow.nodes.filter(
  (candidate) => !removedNames.has(candidate.name),
);

for (const name of [
  "Preservar body bruto",
  "Capturar entrega antes da validacao",
  "Restaurar entrega capturada",
  ...removedNames,
]) {
  delete workflow.connections[name];
}

workflow.connections.Webhook1 = {
  main: [[connection("Preparar entrega Meta")]],
};
workflow.connections["Preparar entrega Meta"] = {
  main: [[connection("Guardar entrega antes do ACK")]],
};
workflow.connections["Guardar entrega antes do ACK"] = {
  main: [[connection("Restaurar entrega salva")]],
};
workflow.connections["Restaurar entrega salva"] = {
  main: [[connection("Responder 200")]],
};

setPosition("Responder 200", 1216, 576);
setPosition("Normalizar payload oficial", 1440, 496);
setPosition("Separar mensagens", 1664, 496);
setPosition("Buscar historico da conversa", 1888, 496);
setPosition("Classificar inicio de conversa", 2112, 496);
setPosition("Modo de teste seguro?", 2336, 496);
setPosition("Resultado do teste seguro", 2560, 736);
setPosition("Registrar conversation_started", 2560, 496);
setPosition("Continuar fluxo legado", 2784, 496);
setPosition("Edit Fields", 3008, 496);
setPosition("Wait1", 3232, 496);
setPosition("Filter", 3456, 496);
setPosition("Inserir ou atualizar Lead no Banco", 3680, 496);
setPosition("Acerta Fuso", 3904, 496);
setPosition("Gera Timestamp", 4128, 496);
setPosition("[HASH] Phone1", 4352, 496);
setPosition("Buscar tokens", 4576, 496);
setPosition("Loop Over Items", 4800, 496);
setPosition("Busca Pixel", 5024, 512);
setPosition("Filtra page_id e pixel_id", 5248, 496);
setPosition("Envia convers\u00e3o de Lead", 5472, 496);
setPosition("atualizar dados", 5696, 496);
setPosition("atualiza\u00e7\u00e3o lead no banco", 5920, 496);

requireNode("Contrato Meta Oficial WppTrack").parameters.content =
  `# Meta Oficial -> WppTrack

1. O POST e aceito sem validacao de assinatura HMAC.
2. Toda entrega e salva no inbox antes do ACK 200.
3. O payload JSON normal do Webhook alimenta a normalizacao.
4. wpptrack_test_mode executa um dry-run sem efeitos de producao.
5. Cada messages[].id gera no maximo um conversation_started.
6. Retries incrementam duplicate_count e nao repetem o fluxo legado.
7. A tabela legada e o LeadSubmitted continuam apenas para mensagens com CTWA durante a sombra.`;

workflow.name = workflow.name.replace(
  / - (?:durable inbox|pre-validation inbox|sem validacao HMAC)$/,
  "",
);
workflow.name += " - sem validacao HMAC";
workflow.active = false;
workflow.pinData = {};

const nodeNames = new Set(workflow.nodes.map((candidate) => candidate.name));

for (const [source, outputs] of Object.entries(workflow.connections)) {
  if (!nodeNames.has(source)) {
    throw new Error(`Connection source does not exist: ${source}`);
  }

  for (const branch of outputs.main ?? []) {
    for (const target of branch) {
      if (!nodeNames.has(target.node)) {
        throw new Error(`Connection target does not exist: ${target.node}`);
      }
    }
  }
}

const serialized = JSON.stringify(workflow);

if (
  /Meta App Secret|x-hub-signature|signature_valid|Responder 401|Calcular assinatura Meta/i.test(
    serialized,
  )
) {
  throw new Error("The unsigned workflow still contains signature validation");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      signatureValidation: false,
      durableInboxBeforeAck: true,
    },
    null,
    2,
  ),
);
