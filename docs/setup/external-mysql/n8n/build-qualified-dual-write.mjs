import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: node build-qualified-dual-write.mjs <source-workflow.json> <output-workflow.json>',
  );
}

const workflow = JSON.parse(await readFile(inputPath, 'utf8'));
const insertNodeName = 'Registrar evento qualificado';

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

const editFieldsNode = requireNode('Edit Fields');
const webhookNode = requireNode('Webhook');
const lookupNode = requireNode('Busca Telefone');
const stickyNote = requireNode('Sticky Note');
const unsafeNode = requireNode('HTTP Request');

if (isConnected(unsafeNode.name)) {
  throw new Error('Refusing to remove the inline-secret HTTP node because it is connected');
}

const mysqlCredentials = structuredClone(lookupNode.credentials);
const originalLookupPosition = [...lookupNode.position];

const phoneAssignment = editFieldsNode.parameters.assignments.assignments.find(
  (assignment) => assignment.name === 'telefone',
);

if (!phoneAssignment) {
  throw new Error('The telefone assignment was not found in Edit Fields');
}

phoneAssignment.value =
  '={{ String($json["body"]["phone"] || "").replace(/\\D/g, "") }}';

const lookupPhoneCondition = lookupNode.parameters.where.values.find(
  (condition) => condition.column === 'telefone',
);

if (!lookupPhoneCondition) {
  throw new Error('The telefone lookup condition was not found in Busca Telefone');
}

lookupPhoneCondition.value = '={{ $node["Edit Fields"].json["telefone"] }}';

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
  source_url
) VALUES (
  CONCAT('kinbox:qualified:', $1),
  'kinbox_mysql',
  'qualified_lead',
  NULLIF($2, ''),
  NULLIF($3, ''),
  $1,
  UTC_TIMESTAMP(3),
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  NULLIF($7, '')
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  updated_at = CURRENT_TIMESTAMP(3);`,
    options: {
      queryReplacement:
        '={{ [\n  $node["Edit Fields"].json["telefone"],\n  $node["Webhook"].json["body"]["event_name"] || "",\n  $node["Webhook"].json["body"]["lead_id"] || $node["Webhook"].json["body"]["external_id"] || $node["Edit Fields"].json["telefone"],\n  $now.setZone("America/Sao_Paulo").toFormat("yyyy-MM-dd"),\n  $node["Webhook"].json["body"]["source_id"] || "",\n  $node["Webhook"].json["body"]["ctwa_clid"] || "",\n  $node["Webhook"].json["body"]["source_url"] || ""\n] }}',
    },
  },
  type: 'n8n-nodes-base.mySql',
  typeVersion: 2.5,
  position: originalLookupPosition,
  id: 'd247be39-01fc-4bdd-a47a-ef2968d91a3e',
  name: insertNodeName,
  credentials: mysqlCredentials,
};

workflow.nodes = workflow.nodes.filter((node) => node.name !== unsafeNode.name);
workflow.nodes.push(insertNode);

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

stickyNote.parameters.content = `# Dual-write WppTrack

1. O evento append-only e salvo antes do envio para a Meta.
2. O tipo canonico e sempre qualified_lead.
3. Repeticoes incrementam duplicate_count sem criar outro evento.
4. Mantenha o envio Meta atual durante a reconciliacao em modo sombra.`;
stickyNote.parameters.height = 288;
stickyNote.parameters.width = 512;

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
    },
    null,
    2,
  ),
);
