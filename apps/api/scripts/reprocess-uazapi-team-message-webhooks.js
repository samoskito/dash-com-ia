// Reprocess a single Uazapi WebhookLog row through the U2c message_phrase
// team-message (fromMe=true) evaluation path, for diagnosing why a rule did
// or did not match.
//
// Usage (from apps/api):
//   WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --dry-run
//   WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --execute
//
// Safety:
// - Dry-run by default; only reads WebhookLog + ProviderConversionRuleConfig.
// - --execute does not have a safe non-Nest path to call evaluateTeamMessage
//   (it needs UazapiConversionBridgeService, ProviderConversionDecisionEngine,
//   ProviderConversionOrchestrator, ProviderConversionPaidLeadResolver,
//   InboundWebhookProductionQueueService, UazapiAdapter and
//   MetaTokenEncryptionService wired via Nest DI) so it refuses to run and
//   prints how to do it instead.
//
// Requires DATABASE_URL. Run from /app/apps/api so @prisma/client resolves.

console.error("REPROCESS_TEAM_MSG_VERSION=2026-08-22a");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const mode = process.argv.includes("--execute") ? "execute" : "dry-run";

const webhookLogId = process.env.WEBHOOK_LOG_ID;
if (!webhookLogId) {
  console.error("Uso: WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js [--dry-run|--execute]");
  process.exit(1);
}

function firstString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function maskPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return digits ? "*".repeat(digits.length) : null;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// Mirrors apps/api/src/webhooks/uazapi-webhook-parser.ts (getPhone/getMessageText).
function extractFromSummaryPayload(body) {
  const message = recordValue(body.message);
  const contact = recordValue(body.contact);
  const chat = recordValue(body.chat);

  const phone =
    firstString(body.phone) ||
    firstString(body.from) ||
    firstString(body.sender) ||
    firstString(contact?.phone) ||
    firstString(chat?.phone) ||
    firstString(message?.chatid) ||
    firstString(chat?.wa_chatid);

  let messageText;
  if (typeof body.message === "string") {
    messageText = firstString(body.message);
  } else if (message) {
    messageText =
      firstString(message.text) ||
      firstString(message.body) ||
      firstString(message.message) ||
      firstString(message.conversation);
  }
  messageText =
    messageText ||
    firstString(body.text) ||
    firstString(body.body) ||
    firstString(body.messageText);

  const fromMe = message ? message.fromMe === true : undefined;

  return { phone, messageText, fromMe };
}

async function loadActiveMessagePhraseRules(workspaceId) {
  return prisma.providerConversionRuleConfig.findMany({
    where: {
      workspaceId,
      removedAt: null,
      conversionRule: { triggerType: "message_phrase", active: true },
    },
    select: {
      id: true,
      mode: true,
      messageTriggerPhrases: true,
      messageAuthorScope: true,
      conversionRule: { select: { id: true, name: true, triggerValue: true } },
    },
  });
}

function hasPhraseMatch(rules, messageText) {
  if (!messageText) return false;
  const haystack = messageText.toLocaleLowerCase("pt-BR");
  return rules.some((rule) => {
    const phrases = rule.messageTriggerPhrases?.length
      ? rule.messageTriggerPhrases
      : [rule.conversionRule.triggerValue];
    return phrases.some(
      (phrase) =>
        typeof phrase === "string" &&
        haystack.includes(phrase.toLocaleLowerCase("pt-BR")),
    );
  });
}

async function main() {
  console.log("=== REPROCESS UAZAPI TEAM MESSAGE (message_phrase) ===");
  console.log({ mode, webhookLogId });

  const log = await prisma.webhookLog.findUnique({
    where: { id: webhookLogId },
    select: {
      id: true,
      workspaceId: true,
      whatsappInstanceId: true,
      source: true,
      receivedAt: true,
      summaryPayload: true,
    },
  });

  if (!log) {
    console.error("ERRO: WebhookLog nao encontrado:", webhookLogId);
    process.exit(1);
  }
  if (!log.workspaceId) {
    console.error("ERRO: WebhookLog sem workspaceId:", webhookLogId);
    process.exit(1);
  }

  const body = recordValue(log.summaryPayload);
  if (!body) {
    console.error("ERRO: WebhookLog sem summaryPayload utilizavel:", webhookLogId);
    process.exit(1);
  }

  const { phone, messageText, fromMe } = extractFromSummaryPayload(body);
  const rules = await loadActiveMessagePhraseRules(log.workspaceId);
  const targetPhrase = "consulta está agendada";
  const hasTargetPhraseMatch = Boolean(
    messageText &&
      messageText
        .toLocaleLowerCase("pt-BR")
        .includes(targetPhrase.toLocaleLowerCase("pt-BR")),
  );
  const hasAnyRuleMatch = hasPhraseMatch(rules, messageText);

  console.log("=== DRY-RUN ===");
  console.log({
    webhookLogId: log.id,
    workspaceId: log.workspaceId,
    whatsappInstanceId: log.whatsappInstanceId,
    receivedAt: log.receivedAt,
    phoneMasked: phone ? maskPhone(phone) : null,
    fromMe: fromMe ?? null,
    messageTextPresent: Boolean(messageText),
    hasTargetPhraseMatch,
    hasAnyActiveRuleMatch: hasAnyRuleMatch,
    activeMessagePhraseRules: rules.map((r) => ({
      providerRuleId: r.id,
      mode: r.mode,
      authorScope: r.messageAuthorScope,
      conversionRuleId: r.conversionRule.id,
      conversionRuleName: r.conversionRule.name,
    })),
  });

  if (mode !== "execute") {
    console.log("DRY-RUN: nada foi executado. Rode com --execute para tentar avaliar de verdade.");
    return;
  }

  console.error("EXECUTE_NOT_WIRED");
  console.error(
    [
      "evaluateTeamMessage() vive em UazapiProviderConversionService e depende de",
      "servicos injetados via Nest DI (UazapiConversionBridgeService,",
      "ProviderConversionDecisionEngine, ProviderConversionOrchestrator,",
      "ProviderConversionPaidLeadResolver, InboundWebhookProductionQueueService,",
      "UazapiAdapter, MetaTokenEncryptionService). Nao ha um jeito seguro de",
      "instancia-los fora do bootstrap do Nest a partir deste script.",
      "",
      "Para reprocessar de verdade, replaye o payload original contra o endpoint",
      "de producao (o mesmo body de summaryPayload, no webhook Uazapi real), ou",
      "escreva um teste/e2e do Nest (ver apps/api/test) que monte o AppModule",
      "(ou pelo menos UazapiProviderConversionService + suas dependencias) e",
      "chame evaluateTeamMessage() diretamente com os campos impressos acima",
      "(phone, messageText, workspaceId, instance).",
    ].join("\n"),
  );
  process.exit(2);
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
