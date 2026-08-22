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
// - --execute bootstraps a minimal Nest application context (just enough DI
//   to construct UazapiProviderConversionService) and calls
//   evaluateTeamMessage() for real, the same code path production webhooks
//   go through. This can enqueue a production execution if a rule matches.
//
// Requires DATABASE_URL (and REDIS_URL for --execute, since
// InboundWebhookProductionQueueService needs the production BullMQ queue).
// Run from /app/apps/api so @prisma/client and the compiled dist/ resolve.

console.error("REPROCESS_TEAM_MSG_VERSION=2026-08-22b");

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

// Minimal Nest application context: just enough DI to construct
// UazapiProviderConversionService, without pulling in HTTP controllers,
// AuthModule, WorkspacesModule, or the unrelated queues that the full
// AppModule wires up. Loaded lazily (only for --execute) because it needs
// the compiled dist/ output and reflect-metadata.
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
    const result = await service.evaluateTeamMessage({
      workspaceId: log.workspaceId,
      instance,
      phone,
      messageText,
      externalMessageId,
      occurredAt: log.receivedAt ?? undefined,
    });
    console.log("=== EVALUATE RESULT ===");
    console.log(result);
  } finally {
    await app.close();
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
