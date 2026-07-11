# WppTrack - Fundacao de Dados Externos MySQL/Kinbox - Design Spec

Data: 2026-07-11

Status: Aprovada

## 1. Objetivo

Adicionar ao WppTrack uma fonte alternativa de dados WhatsApp para clientes que ja operam API Oficial, Kinbox e automacoes n8n, sem exigir uma instancia Uazapi da plataforma.

A fundacao deve importar historico, receber novos eventos de conversa e conversao, normalizar tudo para os modelos internos do WppTrack e alimentar Visao Geral, Leads, Relatorios e CAPI com as mesmas formulas usadas pelos providers nativos.

## 2. Motivo da Antecipacao

Meta OAuth ja fornece campanhas, contas e metricas de midia, mas o ambiente atual ainda nao possui conversas e conversoes WhatsApp reais. Construir as paginas finais apenas com dados Meta deixa sem validacao:

- Conversas reais iniciadas.
- Conversas organicas.
- Taxa de rastreamento.
- Lead qualificado.
- Primeira compra e recompra.
- Faturamento de trafego, organico e total.
- ROAS de aquisicao e ROAS com recompra.

Por isso, a fundacao de dados externos passa a ser o Bloco 0.5, antes da retomada da Visao Geral. A interface de autosservico e os novos providers nativos continuam no Bloco 5.

## 3. Escopo

Esta etapa inclui:

1. Schema MySQL padronizado para eventos append-only e views de leitura.
2. Importacao do historico existente de leads WhatsApp.
3. Sincronizacao incremental e retomavel para o PostgreSQL WppTrack.
4. Contrato canonico de eventos independente do provider.
5. Adapter `kinbox_mysql` com regras especificas de idempotencia.
6. Valor medio configurado no WppTrack com identificacao de estimativa.
7. Workflows n8n atualizados para gravar primeiro no ledger.
8. Execucao em modo sombra antes do cutover CAPI.
9. Diagnosticos de conexao, sync, rejeicao, duplicidade e conciliacao.

Esta etapa nao inclui:

- Interface final de autosservico para todos os clientes.
- Escrita do WppTrack no banco MySQL do cliente.
- Substituicao imediata do n8n por adapters nativos.
- Importacao recorrente de campanhas pela tabela `facebook_ads_*`.
- Chat, CRM, Kanban ou armazenamento completo de mensagens.

## 4. Fontes de Verdade

### 4.1 Meta Ads

Meta OAuth/Graph API no WppTrack e a fonte de verdade para campanhas, conjuntos, anuncios, contas, investimento e demais metricas Meta.

A tabela externa `facebook_ads_*` pode ser usada somente para:

- Backfill legado anterior a uma data de corte explicita, quando a Graph API nao cobrir o periodo necessario.
- Reconciliacao controlada durante a implantacao.

Em qualquer sobreposicao, o dado direto da Meta vence. O import legado deve registrar `source=legacy_mysql` para nao se misturar silenciosamente com snapshots oficiais.

### 4.2 WhatsApp e Conversoes

- `whatsapp_anuncio_*` e snapshot historico de um lead por telefone.
- A nova tabela `tracking_events` e a fonte de verdade para novos eventos.
- PostgreSQL WppTrack e a fonte consultada pelas telas e formulas.
- MySQL nunca e consultado durante a renderizacao de paginas.

## 5. Evidencias Analisadas

### 5.1 Schema MySQL

O schema padronizado possui:

- `contas_anuncio_*`: conta, BM, status e token operacional.
- `facebook_ads_*`: metricas diarias por anuncio.
- `whatsapp_anuncio_*`: lead, telefone, datas de qualificacao/compra, valor e atribuicao.

Limitacoes observadas:

- `whatsapp_anuncio_*` usa telefone como primary key e sobrescreve compras.
- Nao existe historico append-only de conversas, qualificacoes e compras.
- Datas de funil antigas usam `date`, sem horario exato.
- `gasto` usa `float` e nao deve virar fonte financeira oficial.
- A tabela de contas contem token e nao pode ser exposta ao usuario de leitura do WppTrack.

### 5.2 Payload Oficial Meta WhatsApp

O payload de nova conversa fornece:

- `messages[].id`: idempotencia da mensagem.
- `messages[].from` ou `contacts[].wa_id`: telefone.
- `contacts[].profile.name`: nome.
- `messages[].timestamp`: horario real UTC.
- `entry[].id`: WABA da conexao oficial.
- `metadata.phone_number_id`: numero oficial conectado.
- `messages[].referral.source_id`: anuncio.
- `messages[].referral.ctwa_clid`: atribuicao CTWA.
- `messages[].referral.source_url`: URL de origem.
- `messages[].text.body`: mensagem real do lead.

O payload nao declara sozinho que o contato e novo. A regra de `conversation_started` usa identidade do telefone, numero conectado, historico e idempotencia da mensagem.

### 5.3 Payload Kinbox

O payload Kinbox fornece nome externo do evento, telefone, `external_id`, `lead_id` e nome do lead. Neste cliente ele nao fornece:

- Timestamp do evento.
- Event ID do provider.
- Transaction ID.
- Valor real.
- Moeda.
- CTWA/atribuicao preenchida.

O adapter usa telefone para localizar o lead original e reaproveitar atribuicao Meta ja persistida. O tipo canonico vem da configuracao do workflow/rota, nunca do texto livre `event_name`.

## 6. Contrato Canonico de Evento

Todo provider deve normalizar para um contrato equivalente a:

```ts
type CanonicalTrackingEvent = {
  connectorId: string;
  provider: string;
  eventType: "conversation_started" | "qualified_lead" | "purchase";
  externalEventId?: string | null;
  externalLeadId?: string | null;
  transactionId?: string | null;
  phone: string;
  occurredAt: string;
  workspaceLocalDate: string;
  sourceEventName?: string | null;
  adId?: string | null;
  adSetId?: string | null;
  campaignId?: string | null;
  ctwaClid?: string | null;
  sourceUrl?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  valueSource?: "actual" | "configured_average" | "manual" | null;
  dedupeKey: string;
};
```

O contrato nao deve carregar credenciais, headers completos ou payload cru sensivel para o frontend.

## 7. Politicas de Idempotencia por Provider

Idempotencia e responsabilidade do adapter. Nao existe regra global de uma compra por dia.

### 7.1 Meta Oficial

- `conversation_started`: chave baseada em connector + `messages[].id`.
- Repeticao do mesmo webhook retorna duplicate sem recriar lead/evento.

### 7.2 Kinbox deste contrato

- `QualifiedLead`: uma vez por connector + identidade do lead.
- `Purchase`: uma vez por connector + identidade do lead + dia civil no fuso do workspace.
- Repeticao no mesmo dia: auditada como duplicada.
- Compra em outro dia: novo evento e potencial recompra.
- Transaction/event ID interno: derivado da chave idempotente persistida e reutilizado em retries.

### 7.3 Outros providers

Providers com transaction ID ou event ID confiavel podem aceitar varias compras do mesmo lead no mesmo dia. A chave deve priorizar:

1. Provider event ID.
2. Transaction/order ID.
3. Politica especifica explicitamente aprovada para aquele adapter.

Testes devem provar que a restricao diaria da Kinbox nao afeta outros adapters.

## 8. Valor de Compra

Kinbox nao fornece valor real neste cliente. O WppTrack usa o valor medio configurado no mapeamento do evento `Purchase`.

Regras:

- O valor e copiado para o evento no momento da ingestao.
- Alterar a configuracao nao muda eventos historicos.
- `valueSource=configured_average` identifica estimativa.
- Dashboards, CSV e PDF devem exibir faturamento/ROAS como estimados quando o agregado contiver valores estimados.
- Valor real futuro tem prioridade e usa `valueSource=actual`.
- Evento sem valor real ou configurado fica bloqueado para CAPI, sem falso sucesso.

O modelo atual `ConversionRule.defaultValueCents` pode fornecer o valor, mas `ConversionEventLog` precisa guardar a origem do valor.

## 9. Schema Externo Padronizado

### 9.1 Ledger append-only

A nova tabela padrao `tracking_events` deve possuir no minimo:

- `id` bigint auto-increment, cursor principal.
- `dedupe_key` unique.
- `provider`.
- `event_type` canonico.
- `source_event_name` apenas para auditoria.
- `external_event_id`.
- `external_lead_id`.
- `transaction_id`.
- `phone`.
- `occurred_at` datetime com milissegundos.
- `event_local_date`.
- `ad_id`, `adset_id`, `campaign_id`.
- `ctwa_clid`, `source_url`.
- `value_cents`, `currency`, `value_source`.
- `duplicate_count`.
- `first_received_at`, `last_received_at`, `updated_at`.

Indices obrigatorios:

- Unique em `dedupe_key`.
- Index em `id`.
- Index em `updated_at, id`.
- Index em `phone, occurred_at`.
- Index em `event_type, occurred_at`.

### 9.2 Views de leitura

Cada banco expoe nomes fixos, independentemente do sufixo fisico do cliente:

- `vw_wpptrack_leads`.
- `vw_wpptrack_events`.
- `vw_wpptrack_ads_legacy`, apenas quando backfill Meta for necessario.

Nenhuma view inclui tokens. O usuario MySQL do WppTrack recebe apenas `SELECT` nessas views.

## 10. Modelo Interno WppTrack

Adicionar ou evoluir:

- `ExternalDataConnector`: workspace, provider, timezone, status e credenciais criptografadas.
- `ExternalSyncCursor`: connector, stream, ultimo ID/updated_at confirmado e horarios de sync.
- Source `external_mysql`/`kinbox_mysql` nos diagnosticos e leads.
- `ConversionEventLog.valueSource` para distinguir valor real, medio ou manual.
- Metadados seguros de source row e connector para reconciliacao.

O dashboard continua consultando somente PostgreSQL.

## 11. Sincronizacao

### 11.1 Backfill

1. Ler `vw_wpptrack_leads` em lotes.
2. Normalizar telefone e calcular identidade/hash no backend.
3. Upsert de lead por workspace + phoneHash.
4. Derivar eventos historicos apenas quando datas confiaveis existirem.
5. Marcar limitacoes do historico; nao inventar recompra perdida no snapshot.

### 11.2 Incremental

1. Worker le `vw_wpptrack_events` por cursor em lotes limitados.
2. Normaliza e valida cada row.
3. Grava diagnostico e evento interno idempotente.
4. Atualiza lead/atribuicao.
5. Enfileira CAPI somente quando modo de envio estiver ativo.
6. Confirma cursor apenas depois da transacao PostgreSQL bem-sucedida.
7. Em falha, repete o lote sem duplicar efeitos.

Rows invalidas ficam auditadas e nao bloqueiam indefinidamente as demais. O conector deve oferecer retry/reprocessamento controlado.

## 12. Mudancas no n8n

### 12.1 Fluxo atual observado

O Purchase atual:

1. Recebe Kinbox sem autenticacao visivel.
2. Busca telefone no MySQL.
3. Busca todos os tokens de contas.
4. Descobre Pixel/Pagina a partir do anuncio.
5. Envia CAPI com valor fixo e event ID baseado so em CTWA.
6. Atualiza a linha unica do telefone depois do envio.

Riscos: perda se Meta falhar, recompra deduplicada incorretamente, tokens em workflow/DB e historico sobrescrito.

### 12.2 Fluxo novo

Cada workflow passa a executar:

1. Webhook com segredo de alta entropia por connector.
2. Normalizacao de telefone e horario `America/Sao_Paulo`.
3. Tipo canonico fixado pelo workflow, nao por `event_name`.
4. Construcao da chave idempotente.
5. Insert/upsert em `tracking_events` antes de qualquer side effect externo.
6. Resposta de sucesso ao provider.

Depois do cutover, remover/desativar:

- Busca de tokens Meta.
- Loop de contas.
- Descoberta de Pixel/Pagina.
- Envio CAPI direto.
- Valor medio hardcoded.

O workflow exportado contem `pinData` real e token Uazapi em no desconectado. A versao corrigida deve remover dados fixados, usar credentials e exigir rotacao do token exposto.

## 13. Seguranca

- A conexao MySQL existe somente na API/worker.
- Usuario dedicado e somente leitura para as views.
- TLS e allowlist do IP da API quando suportados.
- Host, usuario e senha criptografados; segredos nunca retornam ao frontend.
- Queries usam nomes fixos e valores parametrizados.
- Limites de lote, timeout e circuit breaker protegem o banco do cliente.
- Webhooks n8n usam segredo por connector armazenado como hash no WppTrack.
- Meta Oficial futuro valida `X-Hub-Signature-256` sobre o body bruto com comparacao segura.
- Headers, tokens, telefones integrais e payloads crus nao aparecem em logs comuns.

## 14. Observabilidade

Expor para backoffice e, de forma simplificada, para o cliente:

- Status da conexao.
- Ultimo sync iniciado e concluido.
- Cursor atual.
- Rows lidas, importadas, duplicadas, rejeitadas e pendentes.
- Leads sem correspondencia.
- Eventos bloqueados por falta de valor/atribuicao.
- Latencia do banco externo e duracao dos lotes.
- Divergencia de reconciliacao no modo sombra.

## 15. Cutover em Modo Sombra

1. Criar tabela, views, usuario read-only e indices.
2. Implantar modelos internos e worker sem envio CAPI externo.
3. Atualizar workflows n8n para escrever no ledger, mantendo temporariamente o envio antigo.
4. Executar backfill e sync incremental em modo sombra.
5. Comparar contagens por dia, telefone e tipo de evento.
6. Corrigir divergencias e reprocessar quando necessario.
7. Ativar CAPI WppTrack com event IDs persistentes.
8. Desativar os nos antigos Meta no n8n para impedir duplo envio.
9. Rotacionar tokens expostos e remover `pinData`.
10. Observar producao antes de retomar o Bloco 1.

## 16. Tratamento de Erros

- Banco indisponivel: retry com backoff; paginas continuam usando o ultimo snapshot PostgreSQL.
- Row invalida: registrar erro seguro e seguir o lote.
- Evento antes do lead: manter pendente e reconciliar por telefone depois.
- Duplicidade: registrar duplicate sem novo evento/CAPI.
- Falta de valor Purchase: bloquear envio e mostrar motivo.
- Falta de CTWA/ad: preservar evento de negocio e separar falha de atribuicao/envio Meta.
- Falha CAPI: evento continua contando no negocio e aparece na auditoria Meta para retry.

## 17. Testes Obrigatorios

### Unidade

- Parser Meta oficial com payload real anonimizado.
- Normalizacao Kinbox sem depender de `event_name`.
- Telefone e timezone.
- Valor medio e snapshot de `valueSource`.
- Chaves idempotentes por adapter.

### Idempotencia

- Kinbox Purchase repetido no mesmo dia gera um evento.
- Kinbox Purchase em outro dia gera recompra.
- Outro provider com dois transaction IDs no mesmo dia gera duas compras.
- Retry reutiliza transaction/event ID.

### Integracao

- Backfill paginado.
- Cursor so avanca apos commit.
- Retomada depois de falha.
- Isolamento entre workspaces.
- Nenhum token aparece em DTO/log.
- CAPI permanece desligado no modo sombra.

### Reconciliacao

- Contagens diarias MySQL versus PostgreSQL.
- Amostras anonimizadas por telefone hash.
- Totais de qualificados, compras e duplicados.
- Faturamento estimado identificado corretamente.

## 18. Criterios de Aceite

- Dados historicos importados sem duplicacao e sem inventar informacao ausente.
- Novos eventos chegam ao PostgreSQL de forma incremental e retomavel.
- Dashboard nao depende da disponibilidade do MySQL.
- Kinbox limita Purchase a um por lead/dia apenas em seu adapter.
- Outros providers aceitam varias compras no mesmo dia com IDs confiaveis.
- Valor medio aparece como estimativa em UI, CSV e PDF.
- Segredos permanecem backend-only.
- Shadow sync reconcilia com o fluxo atual antes do cutover.
- CAPI WppTrack substitui o envio n8n sem duplo disparo.

## 19. Evolucao Futura

O mesmo contrato canonico deve receber:

- Uazapi.
- Meta WhatsApp/Cloud API oficial nativa.
- Kinbox nativo.
- Outros providers WhatsApp.
- Webhooks ou importadores de plataformas de venda.

Cada adapter possui autenticacao, parser e idempotencia proprios. Leads, metricas, auditoria e CAPI permanecem independentes do provider.
