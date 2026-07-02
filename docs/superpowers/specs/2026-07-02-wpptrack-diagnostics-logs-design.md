# WppTrack - Diagnosticos e Logs Operacionais

Data: 2026-07-02

## Objetivo

Criar uma Central de Diagnostico no backoffice interno para donos e operadores do SaaS investigarem problemas sem abrir banco de dados, terminal ou painel de provedor externo como primeira resposta.

A central deve permitir debug por workspace de:

- Webhooks recebidos.
- Jobs e tentativas em fila.
- Eventos de conversao enviados ou bloqueados.
- Integracoes Meta, Uazapi e Asaas.
- Automacoes internas.
- Mudancas operacionais em campanhas, conjuntos e anuncios.

O objetivo nao e substituir observabilidade tecnica profunda, mas transformar os rastros operacionais mais importantes em uma interface confiavel para suporte, auditoria e recuperacao segura.

## Principios

- Todo log deve estar associado a um `workspaceId` quando o evento pertencer a uma empresa final.
- Eventos globais da plataforma podem existir sem workspace, mas devem ser claramente marcados como plataforma.
- A leitura padrao deve ser resumida, filtravel e segura para operador.
- Payload bruto e dado sensivel devem ficar restritos a operadores de plataforma com permissao elevada.
- Secrets, tokens, chaves de API, cookies, Authorization headers e refresh tokens nunca devem aparecer na interface.
- Telefone, nome e identificadores pessoais devem ser exibidos com redacao em listas amplas quando nao forem essenciais.
- Toda acao manual de retry, requeue, reenviar conversao ou alterar campanha deve gerar auditoria com ator e motivo.
- Retentativas devem priorizar idempotencia, previsibilidade e rastreabilidade.

## Fontes

As fontes normalizadas iniciais sao:

- `meta`: OAuth, leitura de campanhas, sincronizacao de metricas, envio de eventos ao Pixel, erros da API Meta e mutacoes de campanhas, conjuntos e anuncios.
- `uazapi`: webhooks WhatsApp, status de instancia, mensagens, contatos, etiquetas, falhas de entrega e erros do provedor.
- `asaas`: webhooks de assinatura, cobranca, pagamento, nota fiscal quando aplicavel, split e ativacao de instancia.
- `internal`: jobs, automacoes internas, regras de conversao, mapeamentos, decisoes de bloqueio, reprocessamentos e auditoria.

## Entidades Conceituais

### WebhookLog

Registra a entrada de webhooks externos e o resultado do processamento inicial.

Campos conceituais:

- `id`
- `workspaceId`
- `source`: `meta`, `uazapi`, `asaas` ou `internal`
- `eventType`
- `externalEventId`
- `status`: recebido, processado, ignorado, duplicado, erro, bloqueado
- `receivedAt`
- `processedAt`
- `leadId`
- `phoneHash`
- `campaignId`
- `adSetId`
- `adId`
- `jobId`
- `errorCode`
- `errorMessage`
- `summaryPayload`
- `rawPayloadRef`
- `idempotencyKey`

Uso principal: descobrir se o provedor enviou o evento, se o WppTrack recebeu, como classificou e se criou jobs ou efeitos internos.

### IntegrationLog

Registra chamadas de saida para provedores externos e respostas recebidas.

Campos conceituais:

- `id`
- `workspaceId`
- `source`: `meta`, `uazapi`, `asaas` ou `internal`
- `operation`
- `status`: sucesso, erro, bloqueado, timeout, rate_limited, retry_agendado
- `startedAt`
- `finishedAt`
- `durationMs`
- `requestSummary`
- `responseSummary`
- `httpStatus`
- `providerRequestId`
- `providerErrorCode`
- `providerErrorMessage`
- `leadId`
- `campaignId`
- `adSetId`
- `adId`
- `jobId`

Uso principal: entender falhas da Meta, Uazapi e Asaas sem abrir logs de servidor.

### ConversionEventLog

Registra a vida de um evento de conversao desde a regra interna ate o envio ou bloqueio.

Campos conceituais:

- `id`
- `workspaceId`
- `leadId`
- `phoneHash`
- `sourceTrigger`: palavra_chave, etiqueta, manual, sistema
- `eventName`: por exemplo `LeadSubmitted`, `QualifiedLead`, `Purchase`
- `status`: preparado, enviado, aceito, rejeitado, bloqueado, duplicado, erro
- `pixelId`
- `metaAccountId`
- `campaignId`
- `adSetId`
- `adId`
- `attributionStatus`: completa, parcial, ausente
- `dedupeKey`
- `sentAt`
- `providerResponseSummary`
- `errorCode`
- `errorMessage`
- `jobId`

Uso principal: responder se uma conversao foi enviada ao Pixel, por que falhou ou por que foi bloqueada.

### JobAttempt

Registra execucoes e retentativas de jobs BullMQ ou workers equivalentes.

Campos conceituais:

- `id`
- `workspaceId`
- `queueName`
- `jobId`
- `jobName`
- `attemptNumber`
- `status`: agendado, em_execucao, sucesso, erro, cancelado, bloqueado, requeued
- `scheduledAt`
- `startedAt`
- `finishedAt`
- `nextRetryAt`
- `source`
- `relatedEntityType`
- `relatedEntityId`
- `errorCode`
- `errorMessage`
- `summaryPayload`

Uso principal: saber se um processamento assincrono rodou, falhou, sera retentado ou precisa de acao manual.

### DiagnosticEvent

Registra eventos normalizados para a linha do tempo de diagnostico. Pode apontar para logs especializados.

Campos conceituais:

- `id`
- `workspaceId`
- `source`
- `eventType`
- `severity`: info, warning, error, critical
- `status`
- `occurredAt`
- `title`
- `message`
- `leadId`
- `phoneHash`
- `campaignId`
- `adSetId`
- `adId`
- `jobId`
- `webhookLogId`
- `integrationLogId`
- `conversionEventLogId`
- `jobAttemptId`

Uso principal: alimentar visao consolidada, resumo de saude e timeline de investigacao.

### AuditLog

Registra acoes humanas ou de plataforma que alteram estado, disparam retentativa ou expoem dados sensiveis.

Campos conceituais:

- `id`
- `workspaceId`
- `actorUserId`
- `actorType`: platform_operator, workspace_user, system
- `action`
- `targetType`
- `targetId`
- `reason`
- `createdAt`
- `sourceIp`
- `resultStatus`
- `beforeSummary`
- `afterSummary`

Uso principal: provar quem fez uma acao, por que fez e qual foi o resultado.

## Telas do Backoffice

### Visao Geral de Diagnostico

Tela inicial da central. Deve mostrar:

- Workspaces com mais erros no periodo.
- Volume de eventos por fonte.
- Taxa de sucesso por fonte.
- Jobs com mais falhas.
- Eventos de conversao bloqueados por falta de contexto.
- Ultimos erros criticos.
- Alertas de integracao por workspace.

O operador deve conseguir sair desta tela para uma lista filtrada ou para o detalhe de um evento.

### Lista de Logs com Filtros

Lista unificada alimentada por `DiagnosticEvent`, com acesso aos registros especializados.

Filtros obrigatorios:

- Workspace.
- Fonte.
- Tipo de evento.
- Status.
- Lead ou telefone.
- Campanha, conjunto ou anuncio.
- Periodo.
- Codigo de erro.
- Job id.

Colunas recomendadas:

- Data/hora.
- Workspace.
- Fonte.
- Tipo.
- Status.
- Severidade.
- Entidade relacionada.
- Resumo.
- Codigo de erro.
- Acoes.

Em listas amplas, telefone deve aparecer redigido quando exibido, por exemplo com os ultimos digitos visiveis somente se a permissao permitir.

### Detalhe do Evento

Drawer ou pagina lateral para investigacao rapida.

Conteudo:

- Resumo do evento.
- Linha do tempo relacionada.
- Workspace e fonte.
- Entidades ligadas: lead, telefone redigido, campanha, conjunto, anuncio, pixel, job.
- Payload resumido.
- Resposta externa resumida.
- Erros normalizados.
- Links para logs associados.
- Auditoria de acoes ja feitas.

Payload bruto so deve aparecer para operadores de plataforma com permissao elevada, em area separada e com registro em `AuditLog` quando acessado.

### Drawer de Retry e Requeue

Area de acao segura para tentar novamente um processamento.

Deve mostrar:

- O que sera retentado.
- Por que a acao e considerada segura ou bloqueada.
- Entidade alvo.
- Risco operacional.
- Campo obrigatorio de motivo.
- Confirmacao explicita quando envolver reenviar conversao ou mudar campanha.

Ao confirmar, o sistema deve registrar `AuditLog`, criar novo `JobAttempt` ou atualizar o job existente conforme a implementacao futura definir, e vincular a acao ao evento original.

### Resumo de Saude do Workspace

Tela ou painel lateral focado em um workspace.

Indicadores:

- Status Meta.
- Status Uazapi.
- Status Asaas.
- Ultimos webhooks recebidos por fonte.
- Conversoes enviadas, bloqueadas e com erro.
- Jobs pendentes e com falha.
- Ultimas acoes manuais.
- Alertas de contexto ausente, como Pixel, conta, atribuicao ou instancia WhatsApp.

O objetivo e responder rapidamente se o problema e de integracao, pagamento, atribuicao, fila ou regra interna.

## Regras de Retencao e Privacidade

- Armazenar `summaryPayload` por padrao, contendo somente campos operacionais necessarios para debug.
- Permitir `rawPayloadRef` apenas quando a plataforma precisar preservar payload bruto para investigacao profunda.
- Payload bruto deve ser acessivel somente para operadores de plataforma autorizados.
- Secrets, tokens, refresh tokens, Authorization headers, API keys e cookies devem ser removidos antes de persistir qualquer resumo ou payload bruto.
- Telefones devem ser salvos preferencialmente como hash para busca e correlacao.
- Em listas amplas, telefone deve ser redigido quando exibido.
- Nome, telefone completo e payload bruto devem ficar fora de exportacoes padrao.
- Retencao detalhada pode ser menor que retencao agregada. A implementacao futura deve definir prazos por tipo de log e exigencias legais/comerciais.
- Logs de auditoria devem ter retencao maior que logs operacionais comuns.

## Regras de Retry Seguro

Retentativas so podem ser permitidas quando o evento for idempotente ou quando houver chave clara de deduplicacao.

Permitido com seguranca, quando houver contexto completo:

- Reprocessar webhook duplicavel com `idempotencyKey`.
- Reenfileirar job de leitura/sincronizacao.
- Reconsultar status de cobranca ou assinatura no Asaas.
- Reenviar evento de conversao com `dedupeKey`, desde que o operador confirme e informe motivo.

Exige confirmacao explicita:

- Reenvio de conversao para Meta Pixel.
- Mudanca de campanha, conjunto ou anuncio.
- Reprocessamento que possa alterar status visivel ao cliente.

Todo retry deve registrar:

- Ator.
- Motivo.
- Evento original.
- Resultado da tentativa.
- Novo job ou tentativa criada.

## Eventos que Nao Devem Ser Auto-Retentados

Nao devem ser auto-retentados:

- Ativacao de pagamento ou instancia WhatsApp sem evento Asaas confirmado.
- Mutacoes de orcamento, status de campanha, conjunto ou anuncio na Meta sem acao explicita de usuario ou operador de plataforma.
- Eventos com atribuicao ausente quando o envio depende de `ad_id`, Pixel, conta de anuncio ou conta Meta.
- Eventos de conversao sem contexto minimo de pixel, conta ou deduplicacao.
- Qualquer acao que possa cobrar cliente, liberar recurso pago ou alterar investimento de campanha sem confirmacao.

Esses casos devem aparecer como bloqueados, com motivo claro e proxima acao recomendada para operador.

## Fluxo Operacional Esperado

1. Um provedor envia webhook ou o sistema agenda um job.
2. O backend registra `WebhookLog`, `JobAttempt` ou `IntegrationLog` conforme a origem.
3. O processamento gera um ou mais `DiagnosticEvent`.
4. Se houver conversao, o sistema registra `ConversionEventLog`.
5. Se houver acao humana ou acesso sensivel, registra `AuditLog`.
6. O backoffice exibe a linha do tempo unificada por workspace e permite filtro.
7. Quando seguro, o operador pode retentar com motivo e auditoria.

## Implementacao Adiada

A implementacao Prisma/API desta central fica adiada para um plano posterior de diagnosticos. Nesta wave paralela, a decisao e manter diagnosticos como especificacao para evitar conflito com as alteracoes de Auth/Workspace no schema Prisma, modulos da API e contratos compartilhados.

O plano futuro deve transformar estas entidades em modelo fisico, endpoints, permissoes, testes e telas reais do backoffice.

## Criterios de Pronto da Fase Futura

- Logs principais consultaveis por workspace.
- Filtros obrigatorios funcionando.
- Detalhe de evento mostra payload resumido e erros normalizados.
- Retry seguro exige permissao, motivo e confirmacao quando necessario.
- Acoes manuais geram `AuditLog`.
- Payload bruto nao aparece para usuario comum nem operador sem permissao elevada.
- Eventos bloqueados explicam motivo e nao sao retentados automaticamente.
