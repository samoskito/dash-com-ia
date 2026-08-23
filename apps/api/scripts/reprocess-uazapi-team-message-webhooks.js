// Reprocess a single Uazapi WebhookLog row, or recover a single already
// frozen ProviderConversionDecisionAudit row, through the U2c message_phrase
// team-message (fromMe=true) evaluation path, for diagnosing why a rule did
// or did not match and for recovering occurrences that were audited but left
// without a linked execution.
//
// Usage (from apps/api):
//   DECISION_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --dry-run
//   DECISION_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --execute
//
//   WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --dry-run
//   WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js --execute
//
// DECISION_ID takes priority over WEBHOOK_LOG_ID when both are set.
//
// Safety:
// - Dry-run by default in both modes.
// - DECISION_ID always bootstraps a minimal Nest application context (just
//   enough DI to construct UazapiProviderConversionService) and calls
//   recoverDecision(), which re-runs the orchestrator for the already
//   frozen decision without ever re-evaluating the message. Nothing here
//   talks to WhatsApp; the contact is never messaged again. --execute makes
//   it write (execution row + CAPI enqueue if eligible); dry-run only reads.
// - WEBHOOK_LOG_ID dry-run only reads WebhookLog + ProviderConversionRuleConfig.
//   --execute bootstraps the same Nest application context and calls
//   evaluateTeamMessage() for real, the same code path production webhooks
//   go through. This can enqueue a production execution if a rule matches.
//   If that call fails with evaluation_key_conflict (the occurrence was
//   already frozen by an earlier delivery), the script falls back to
//   locating that frozen decision and recovering it via recoverDecision()
//   instead of failing hard.
//
// Requires DATABASE_URL (and REDIS_URL whenever a Nest application context is
// built, since InboundWebhookProductionQueueService needs the production
// BullMQ queue). Run from /app/apps/api so @prisma/client and the compiled
// dist/ resolve.

console.error("REPROCESS_TEAM_MSG_VERSION=2026-08-22c");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const mode = process.argv.includes("--execute") ? "execute" : "dry-run";

const decisionId = (process.env.DECISION_ID || "").trim() || undefined;
const webhookLogId = process.env.WEBHOOK_LOG_ID;
if (!decisionId && !webhookLogId) {
  console.error(
    "Uso: DECISION_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js [--dry-run|--execute]\n" +
      "  ou WEBHOOK_LOG_ID=<id> node scripts/reprocess-uazapi-team-message-webhooks.js [--dry-run|--execute]",
  );
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
  const externalMessageId = firstString(body.id) || firstString(message?.id);

  return { phone, messageText, fromMe, externalMessageId };
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

// True for the ProviderConversionDecisionPersistenceError raised when a
// second `recordInitial` targets an occurrence that already has a frozen
// decision. Duck-typed on `code` (not `instanceof`) because this script runs
// outside the compiled class hierarchy of the Nest application context.
function isEvaluationKeyConflict(error) {
  return Boolean(error) && error.code === "evaluation_key_conflict";
}

// Locates the frozen decision for an occurrence when evaluateTeamMessage
// could not freeze a new one. occurrenceKey is `uazapi:<channelId>:<id>`
// (see UazapiProviderConversionService), and the channelId is only known
// after bridging the instance, which this diagnostic script does not do, so
// match on the externalMessageId suffix instead.
async function findFrozenDecisionForOccurrence({ workspaceId, externalMessageId }) {
  if (!externalMessageId) return null;
  return prisma.providerConversionDecisionAudit.findFirst({
    where: {
      workspaceId,
      occurrenceKey: { endsWith: `:${externalMessageId}` },
    },
    orderBy: { decisionVersion: "desc" },
    select: { id: true },
  });
}

// Minimal Nest application context: just enough DI to construct
// UazapiProviderConversionService, without pulling in HTTP controllers,
// AuthModule, WorkspacesModule, or the unrelated queues that the full
// AppModule wires up. Loaded lazily (only when a Nest context is actually
// needed) because it needs the compiled dist/ output and reflect-metadata.
async function buildExecuteContext() {
  require("reflect-metadata");
  const { Module } = require("@nestjs/common");
  const { NestFactory } = require("@nestjs/core");
  const { BullModule } = require("@nestjs/bullmq");
  const { PrismaModule } = require("../dist/apps/api/src/common/prisma/prisma.module");
  const { RuntimeModule } = require("../dist/apps/api/src/common/runtime/runtime.module");
  const {
    INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  } = require("../dist/apps/api/src/common/queue/queue.constants");
  const {
    ProviderConversionDecisionEngine,
  } = require("../dist/apps/api/src/conversion-rules/provider-conversion-decision.engine");
  const {
    ProviderConversionDecisionRepository,
  } = require("../dist/apps/api/src/conversion-rules/provider-conversion-decision.repository");
  const {
    ProviderConversionOrchestrator,
  } = require("../dist/apps/api/src/conversion-rules/provider-conversion-orchestrator.service");
  const {
    ProviderConversionPaidLeadResolver,
  } = require("../dist/apps/api/src/conversion-rules/provider-conversion-paid-lead-resolver.service");
  const {
    InboundWebhookProductionQueueService,
  } = require("../dist/apps/api/src/inbound-webhooks/inbound-webhook-production-queue.service");
  const {
    UazapiConversionBridgeService,
  } = require("../dist/apps/api/src/inbound-webhooks/uazapi-conversion-bridge.service");
  const {
    UazapiProviderConversionService,
  } = require("../dist/apps/api/src/inbound-webhooks/uazapi-provider-conversion.service");
  const { UazapiAdapter } = require("../dist/apps/api/src/integrations/uazapi/uazapi.adapter");
  const {
    MetaTokenEncryptionService,
  } = require("../dist/apps/api/src/integrations/meta/meta-token-encryption.service");
  const { INTEGRATION_ENV } = require("../dist/apps/api/src/integrations/integration.types");

  class ReprocessTeamMessageModule {}
  Module({
    imports: [
      PrismaModule,
      RuntimeModule,
      BullModule.forRoot({
        connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      }),
      BullModule.registerQueue({ name: INBOUND_WEBHOOK_PRODUCTION_QUEUE }),
    ],
    providers: [
      ProviderConversionDecisionEngine,
      ProviderConversionDecisionRepository,
      ProviderConversionOrchestrator,
      ProviderConversionPaidLeadResolver,
      InboundWebhookProductionQueueService,
      UazapiConversionBridgeService,
      UazapiProviderConversionService,
      UazapiAdapter,
      MetaTokenEncryptionService,
      { provide: INTEGRATION_ENV, useValue: process.env },
    ],
  })(ReprocessTeamMessageModule);

  const app = await NestFactory.createApplicationContext(ReprocessTeamMessageModule, {
    logger: ["error", "warn"],
  });
  return { app, UazapiProviderConversionService };
}

async function recoverByDecisionId(id) {
  console.log("=== RECOVER DECISION (recoverDecision) ===");
  console.log({ mode, decisionId: id });

  const { app, UazapiProviderConversionService } = await buildExecuteContext();
  try {
    const service = app.get(UazapiProviderConversionService);
    const result = await service.recoverDecision({
      decisionId: id,
      execute: mode === "execute",
    });
    console.log("=== RECOVER RESULT ===");
    console.log(result);
    if (mode !== "execute") {
      console.log(
        "DRY-RUN: nada foi executado. Rode com --execute para recuperar de verdade (reexecuta o orchestrator e pode enfileirar a CAPI).",
      );
    }
  } finally {
    await app.close();
  }
}

async function reprocessByWebhookLogId(id) {
  const log = await prisma.webhookLog.findUnique({
    where: { id },
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
    console.error("ERRO: WebhookLog nao encontrado:", id);
    process.exit(1);
  }
  if (!log.workspaceId) {
    console.error("ERRO: WebhookLog sem workspaceId:", id);
    process.exit(1);
  }

  const body = recordValue(log.summaryPayload);
  if (!body) {
    console.error("ERRO: WebhookLog sem summaryPayload utilizavel:", id);
    process.exit(1);
  }

  const { phone, messageText, fromMe, externalMessageId } =
    extractFromSummaryPayload(body);
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

  if (!phone || !messageText) {
    console.error("ERRO: sem phone/messageText utilizavel neste WebhookLog, evaluateTeamMessage sempre retornaria evaluated=false.");
    process.exit(1);
  }
  if (!log.whatsappInstanceId) {
    console.error("ERRO: WebhookLog sem whatsappInstanceId, nao da para montar UazapiBridgeInstance.");
    process.exit(1);
  }

  const instance = await prisma.whatsappInstance.findUnique({
    where: { id: log.whatsappInstanceId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      providerInstanceId: true,
      providerTokenEncrypted: true,
      providerTokenIv: true,
      providerTokenTag: true,
    },
  });
  if (!instance) {
    console.error("ERRO: WhatsappInstance nao encontrada:", log.whatsappInstanceId);
    process.exit(1);
  }

  console.log("=== EXECUTE (Nest application context) ===");
  const { app, UazapiProviderConversionService } = await buildExecuteContext();
  try {
    const service = app.get(UazapiProviderConversionService);
    let result;
    try {
      result = await service.evaluateTeamMessage({
        workspaceId: log.workspaceId,
        instance,
        phone,
        messageText,
        externalMessageId,
        occurredAt: log.receivedAt ?? undefined,
      });
      console.log("=== EVALUATE RESULT ===");
      console.log(result);
    } catch (error) {
      if (!isEvaluationKeyConflict(error)) throw error;

      console.error(
        "AVISO: evaluation_key_conflict ao reavaliar (ocorrencia ja tem decisao congelada). Tentando recuperar a decisao existente em vez de falhar...",
      );
      const frozen = await findFrozenDecisionForOccurrence({
        workspaceId: log.workspaceId,
        externalMessageId,
      });
      if (!frozen) {
        console.error(
          "ERRO: nao foi possivel localizar a decisao congelada desta ocorrencia (evaluation_key_conflict sem decisao correspondente).",
        );
        throw error;
      }

      console.log("=== RECOVER RESULT (fallback via decisao congelada) ===");
      const recovered = await service.recoverDecision({
        decisionId: frozen.id,
        execute: true,
      });
      console.log(recovered);
    }
  } finally {
    await app.close();
  }
}

async function main() {
  console.log("=== REPROCESS UAZAPI TEAM MESSAGE (message_phrase) ===");
  console.log({
    mode,
    decisionId: decisionId ?? null,
    webhookLogId: decisionId ? null : (webhookLogId ?? null),
  });

  if (decisionId) {
    await recoverByDecisionId(decisionId);
    return;
  }

  await reprocessByWebhookLogId(webhookLogId);
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
