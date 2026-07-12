import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: node build-purchase-dual-write.mjs <source-workflow.json> <output-workflow.json>',
  );
}

const workflow = JSON.parse(await readFile(inputPath, 'utf8'));
const insertNodeName = 'Registrar evento de compra';

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

function collectDownstream(startName) {
  const visited = new Set();
  const queue = [startName];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const outputs = workflow.connections[current]?.main ?? [];

    for (const branch of outputs) {
      for (const connection of branch) {
        queue.push(connection.node);
      }
    }
  }

  return visited;
}

if (workflow.nodes.some((node) => node.name === insertNodeName)) {
  throw new Error(`Workflow already contains node: ${insertNodeName}`);
}

const webhookNode = requireNode('Webhook');
const editFieldsNode = requireNode('Edit Fields');
const lookupNode = requireNode('Busca Telefone');
const metaPurchaseNode = requireNode('Enviar o purchase para a Meta');
const unsafeNode = requireNode('HTTP Request1');

if (isConnected(unsafeNode.name)) {
  throw new Error('Refusing to remove the inline-secret HTTP node because it is connected');
}

const mysqlCredentials = structuredClone(lookupNode.credentials);
const originalLookupPosition = [...lookupNode.position];
const phoneAssignment = editFieldsNode.parameters.assignments.assignments.find(
  (assignment) => assignment.name === 'telefone',
);
const purchaseDateAssignment = editFieldsNode.parameters.assignments.assignments.find(
  (assignment) => assignment.name === '=data_compra',
);

if (!phoneAssignment || !purchaseDateAssignment) {
  throw new Error('The phone or purchase date assignment was not found in Edit Fields');
}

phoneAssignment.value =
  '={{ String($json["body"]["phone"] || "").replace(/\\D/g, "") }}';
purchaseDateAssignment.value =
  '={{ $now.setZone("America/Sao_Paulo").toFormat("yyyy-MM-dd") }}';

const lookupPhoneCondition = lookupNode.parameters.where.values.find(
  (condition) => condition.column === 'telefone',
);

if (!lookupPhoneCondition) {
  throw new Error('The telefone lookup condition was not found in Busca Telefone');
}

lookupPhoneCondition.value = '={{ $node["Edit Fields"].json["telefone"] }}';

const originalEventId =
  '"event_id": "purchase_{{ $node["Busca Telefone"].json["ctwaclid"] }}",';
const dailyEventId =
  '"event_id": "purchase_{{ $node["[HASH] Phone1"].json["dataPhone"] }}_{{ $node["Edit Fields"].json["data_compra"] }}",';

if (!metaPurchaseNode.parameters.jsonBody.includes(originalEventId)) {
  throw new Error('The expected legacy Purchase event_id was not found');
}

metaPurchaseNode.parameters.jsonBody = metaPurchaseNode.parameters.jsonBody.replace(
  originalEventId,
  dailyEventId,
);

const downstreamNodes = collectDownstream(lookupNode.name);

for (const node of workflow.nodes) {
  if (downstreamNodes.has(node.name)) {
    node.position = [node.position[0] + 240, node.position[1]];
  }
}

const insertNode = {
  parameters: {
    operation: 'executeQuery',
    query: `INSERT INTO wpptrack_tracking_events (
  dedupe_key,
  provider,
  event_type,
  source_event_name,
  external_lead_id,
  phone,
  occurred_at,
  event_local_date,
  ad_id,
  ctwa_clid,
  source_url,
  value_cents,
  currency,
  value_source
) VALUES (
  CONCAT('kinbox:purchase:', $1, ':', $4),
  'kinbox_mysql',
  'purchase',
  NULLIF($2, ''),
  NULLIF($3, ''),
  $1,
  UTC_TIMESTAMP(3),
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  NULLIF($7, ''),
  NULL,
  'BRL',
  NULL
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  updated_at = CURRENT_TIMESTAMP(3);`,
    options: {
      queryReplacement:
        '={{ [\n  $node["Edit Fields"].json["telefone"],\n  $node["Webhook"].json["body"]["event_name"] || "",\n  $node["Webhook"].json["body"]["lead_id"] || $node["Webhook"].json["body"]["external_id"] || $node["Edit Fields"].json["telefone"],\n  $node["Edit Fields"].json["data_compra"],\n  $node["Webhook"].json["body"]["source_id"] || "",\n  $node["Webhook"].json["body"]["ctwa_clid"] || "",\n  $node["Webhook"].json["body"]["source_url"] || ""\n] }}',
    },
  },
  type: 'n8n-nodes-base.mySql',
  typeVersion: 2.5,
  position: originalLookupPosition,
  id: '9124e684-63bc-40bd-b50b-2ebed9378c5a',
  name: insertNodeName,
  credentials: mysqlCredentials,
};

const stickyNote = {
  parameters: {
    content: `# Dual-write WppTrack

1. O Purchase e salvo antes do envio para a Meta.
2. A chave Kinbox aceita uma compra por telefone e dia local.
3. O ledger nao inventa valor real; o WppTrack aplica o ticket configurado.
4. O envio Meta legado permanece ativo durante a reconciliacao.`,
    height: 304,
    width: 528,
  },
  type: 'n8n-nodes-base.stickyNote',
  position: [1664, -352],
  typeVersion: 1,
  id: 'd33d1ab0-f79b-4b41-ac43-20b5f8b08f2a',
  name: 'Regra de compra Kinbox',
};

workflow.nodes = workflow.nodes.filter((node) => node.name !== unsafeNode.name);
workflow.nodes.push(insertNode, stickyNote);

for (const node of workflow.nodes) {
  for (const credential of Object.values(node.credentials ?? {})) {
    delete credential.id;
  }
}

const editFieldsOutputs = workflow.connections['Edit Fields']?.main ?? [];
let replacedLookupConnection = false;

for (const branch of editFieldsOutputs) {
  for (const connection of branch) {
    if (connection.node === lookupNode.name) {
      connection.node = insertNodeName;
      replacedLookupConnection = true;
    }
  }
}

if (!replacedLookupConnection) {
  throw new Error('Edit Fields is not connected to Busca Telefone');
}

workflow.connections[insertNodeName] = {
  main: [[{ node: lookupNode.name, type: 'main', index: 0 }]],
};

workflow.name = `${workflow.name} - dual-write WppTrack`;
workflow.active = false;
workflow.pinData = {};

delete webhookNode.webhookId;
delete workflow.id;
delete workflow.versionId;

if (workflow.meta) {
  delete workflow.meta.instanceId;
  workflow.meta.templateCredsSetupCompleted = false;
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      outputPath,
      workflowName: workflow.name,
      active: workflow.active,
      nodeCount: workflow.nodes.length,
      pinDataKeys: Object.keys(workflow.pinData).length,
      removedInlineSecretNode: !workflow.nodes.some((node) => node.name === unsafeNode.name),
      legacyMetaEventIdIsDaily: metaPurchaseNode.parameters.jsonBody.includes(
        'purchase_{{ $node["[HASH] Phone1"].json["dataPhone"] }}_',
      ),
    },
    null,
    2,
  ),
);
