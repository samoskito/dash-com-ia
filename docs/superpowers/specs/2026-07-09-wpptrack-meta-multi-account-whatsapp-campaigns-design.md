# WppTrack Meta Multi-Conta e Campanhas WhatsApp - Design Spec

Data: 2026-07-09

## 1. Objetivo

Evoluir a integracao Meta do WppTrack para suportar clientes finais que usam varios BMs e varias contas de anuncio, sem perder o foco do produto: rastrear campanhas que enviam leads para o WhatsApp.

O sistema deve:

- Permitir varias contas de anuncio ativas para relatorios.
- Consolidar dados por padrao, somando todas as contas ativas.
- Permitir filtros por BM, conta de anuncio, campanha, conjunto e anuncio.
- Manter um unico destino de conversao por workspace: Pixel principal + Pagina Facebook principal.
- Identificar campanhas/conjuntos/anuncios de WhatsApp por destino real do anuncio, nao por metrica de resultado.
- Permitir revisao manual quando a deteccao automatica nao for suficiente.

## 2. Decisoes Aprovadas

- Relatorios suportarao multiplos BMs e multiplas contas de anuncio por workspace.
- Relatorios mostrarao tudo consolidado por padrao.
- Filtros de relatorio permitirao abrir por BM e por conta de anuncio.
- Conversoes nao precisam ser enviadas para multiplos Pixels.
- O workspace tera um Pixel principal unico.
- O workspace tera uma Pagina Facebook principal unica.
- A Pagina Facebook e unica porque o fluxo operacional considera um vinculo principal com o Pixel para eventos de Business Messaging.
- Regras de conversao nao devem pedir Pixel manual por regra; elas usam o destino principal do workspace.
- Campanhas de WhatsApp devem ser detectadas por `destination_type`, creative/CTA e evidencias reais de lead, com override manual do usuario.

## 3. Referencias Meta Usadas no Desenho

- Destination Type no Ad Set: `destination_type` define para onde a pessoa e enviada apos clicar no anuncio. A documentacao lista destinos como `WHATSAPP`, `MESSAGING_MESSENGER_WHATSAPP`, `MESSAGING_INSTAGRAM_DIRECT_WHATSAPP` e combinacoes multidestino. Fonte: https://developers.facebook.com/docs/marketing-api/adset/destination_type/
- Ads that Click to WhatsApp: criativos de Click-to-WhatsApp usam estrutura de creative com Pagina e CTA de WhatsApp, incluindo `WHATSAPP_MESSAGE` em exemplos oficiais. Fonte: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/click-to-whatsapp
- Conversions API for Business Messaging: o guia orienta reutilizar token gerado via Facebook Login for Business e conhecer o `page_id` da Pagina usada para reportar eventos. Fonte: https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging
- Customer Information Parameters: `page_id` representa a Pagina associada ao evento de Business Messaging. Fonte: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters

## 4. Modelo de Produto

### 4.1 Conta Meta conectada

Cada workspace mantem uma conexao OAuth Meta principal.

Ela serve para:

- Listar BMs acessiveis.
- Listar contas de anuncio por BM.
- Listar Pixels.
- Listar Paginas.
- Ler campanhas, conjuntos, anuncios, criativos e insights.
- Enviar eventos CAPI usando o token criptografado no backend.

O usuario pode trocar/reconectar a conta Meta quando necessario. O token nunca aparece no frontend.

### 4.2 Destino de conversao principal

Cada workspace tera um unico destino de conversao ativo:

- Pixel principal.
- Pagina Facebook principal.
- `page_id` salvo no backend.
- Status de validacao.
- Ultima validacao.
- Erro de validacao, quando houver.

Esse destino sera usado por todos os eventos CAPI enviados pelo workspace.

Consequencia:

- Regras de conversao ficam mais simples.
- Nao existe escolha de Pixel por regra.
- O envio CAPI sempre tem um destino unico e previsivel.

### 4.3 Contas para relatorios

O workspace podera ter varias contas de anuncio ativas para relatorios.

Cada item representa:

- BM.
- Conta de anuncio.
- Nome da conta.
- Moeda/timezone quando disponivel.
- Status ativo/inativo.
- Ultima sincronizacao.
- Erro da ultima sincronizacao.

O usuario podera:

- Adicionar conta de anuncio de qualquer BM acessivel.
- Remover/desativar conta.
- Reativar conta.
- Ver se a conta esta sincronizando, ativa ou com erro.

## 5. Campanhas WhatsApp

O WppTrack nao deve assumir que campanha WhatsApp e apenas campanha com resultado de conversa iniciada.

Motivo:

- Uma campanha pode ter objetivo de compra, lead, engajamento ou outro objetivo e ainda assim levar o usuario ao WhatsApp.
- A metrica de resultado exibida pelo Meta pode ser compra, lead ou outro evento, mesmo quando a jornada de clique vai para WhatsApp.

### 5.1 Classificacao automatica

O sistema classificara campanhas/conjuntos/anuncios com base em sinais estruturais:

1. `destination_type` no conjunto de anuncios:
   - `WHATSAPP`
   - `MESSAGING_MESSENGER_WHATSAPP`
   - `MESSAGING_INSTAGRAM_DIRECT_WHATSAPP`
   - `MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP`
   - outros valores futuros que contenham WhatsApp e sejam documentados pela Meta.

2. Creative/CTA:
   - CTA `WHATSAPP_MESSAGE`.
   - `object_story_spec` ou campos equivalentes indicando destino WhatsApp.
   - Link/destino de WhatsApp quando retornado pelo Graph API.

3. Evidencia de lead real:
   - Webhook Uazapi recebeu lead com `ad_id`.
   - Lead/WhatsApp esta vinculado a campanha/conjunto/anuncio.
   - O anuncio gerou conversa rastreada no WppTrack.

### 5.2 Status de classificacao

Cada campanha/conjunto/anuncio sincronizado podera receber uma classificacao operacional:

- `auto_whatsapp`: identificado automaticamente por destino WhatsApp confiavel.
- `creative_whatsapp`: identificado pelo creative/CTA.
- `detected_by_leads`: identificado porque gerou leads reais no WhatsApp.
- `manual_include`: usuario incluiu manualmente.
- `manual_exclude`: usuario excluiu manualmente.
- `needs_review`: existem sinais, mas o sistema nao consegue garantir.
- `not_whatsapp`: sem sinais de WhatsApp.

O override manual tem prioridade sobre a deteccao automatica.

### 5.3 Nivel correto da classificacao

A classificacao deve existir no menor nivel possivel:

- Preferir nivel de anuncio quando o sinal estiver no creative.
- Usar nivel de conjunto quando o sinal vier de `destination_type`.
- Agregar para campanha apenas para apresentacao.

Motivo:

Uma campanha pode conter conjuntos/anuncios com destinos diferentes. Se o sistema classificar a campanha inteira como WhatsApp sem olhar os filhos, pode somar gasto de site, postagem ou outros destinos e distorcer ROAS.

## 6. Relatorios

### 6.1 Padrao consolidado

Por padrao, a tela de relatorios mostra o consolidado de todas as contas de anuncio ativas do workspace.

O consolidado deve considerar apenas itens classificados como WhatsApp, exceto quando o usuario escolher explicitamente ver tudo.

### 6.2 Filtros

Filtros esperados:

- Todas as contas ativas.
- BM.
- Conta de anuncio.
- Campanha.
- Conjunto.
- Anuncio.
- Classificacao WhatsApp:
  - WhatsApp confirmado.
  - Precisa revisar.
  - Excluido.
  - Todos.

### 6.3 Revisao manual

O usuario tera uma area para revisar campanhas:

- Detectadas como WhatsApp.
- Ignoradas.
- Precisam revisar.

Acoes:

- Incluir nos relatorios.
- Excluir dos relatorios.
- Voltar para deteccao automatica.

Essas acoes devem gerar auditoria.

## 7. Sincronizacao Meta

O worker de sync Meta deixara de usar apenas uma `selectedAdAccountId`.

Novo comportamento:

1. Buscar contas de anuncio ativas para relatorio do workspace.
2. Para cada conta:
   - Buscar campanhas.
   - Buscar conjuntos com `destination_type`.
   - Buscar anuncios.
   - Buscar criativos/campos necessarios para detectar WhatsApp.
   - Buscar insights por campanha, conjunto e anuncio.
3. Persistir snapshots com referencia a BM e conta.
4. Rodar classificador WhatsApp.
5. Atualizar status de sync por conta.

Erros devem ser isolados por conta. Uma conta com erro nao deve impedir a sincronizacao das outras contas do workspace.

## 8. Conversoes CAPI

O envio CAPI deve usar:

- Token OAuth/CAPI criptografado no backend.
- Pixel principal do workspace.
- Pagina Facebook principal do workspace (`page_id`).
- `event_name` definido pela regra.
- `event_id`/dedupe key.
- Telefone hasheado quando disponivel.
- `ad_id` quando disponivel.

Se Pixel ou Pagina principal nao estiver configurado, o evento deve ficar bloqueado com diagnostico claro, sem falso sucesso.

## 9. Dados e Migracao Conceitual

O modelo atual tem uma selecao unica em `MetaIntegration`:

- `selectedBusinessId`.
- `selectedAdAccountId`.
- `selectedPixelId`.

O novo desenho deve separar responsabilidades:

### 9.1 `MetaIntegration`

Continua como conexao OAuth por workspace:

- Token criptografado.
- Status.
- Scopes.
- Expiracao.
- Ultima conexao.

Campos antigos de selecao unica ficam legados ou sao migrados.

### 9.2 `MetaConversionDestination`

Nova entidade conceitual:

- `workspaceId`.
- `pixelId`.
- `pixelName`.
- `pageId`.
- `pageName`.
- `status`.
- `lastValidatedAt`.
- `validationError`.

Unica por workspace.

### 9.3 `MetaReportingAccount`

Nova entidade conceitual:

- `workspaceId`.
- `businessId`.
- `businessName`.
- `adAccountId`.
- `adAccountName`.
- `currency`.
- `timezoneName`.
- `active`.
- `lastSyncedAt`.
- `syncStatus`.
- `syncError`.

Unica por workspace + conta de anuncio.

### 9.4 Snapshots Meta

Snapshots existentes (`MetaCampaign`, `MetaAdSet`, `MetaAd`) devem carregar campos suficientes para multi-conta e classificacao:

- `businessId`.
- `adAccountId`.
- `destinationType` quando aplicavel.
- classificacao WhatsApp.
- fonte da classificacao.
- override manual.

## 10. UI Esperada em Integracoes

A area Meta deve ser reorganizada:

1. Conta Meta conectada.
2. Destino de conversao:
   - Pixel principal.
   - Pagina Facebook principal.
   - status de validacao.
3. Contas para relatorios:
   - adicionar conta por BM.
   - tabela de contas ativas/inativas.
   - ultima sincronizacao e erro.
4. Revisao de campanhas WhatsApp:
   - resumo de campanhas detectadas.
   - pendencias de revisao.
   - acesso para incluir/excluir manualmente.

## 11. Backoffice e Diagnostico

O backoffice deve conseguir investigar:

- Quais contas Meta estao ativas por workspace.
- Qual Pixel/Pagina principal esta configurado.
- Erros de sync por conta.
- Campanhas em `needs_review`.
- Classificacoes manuais.
- Eventos CAPI bloqueados por falta de Pixel/Pagina.

## 12. Testes e Validacao

Testes esperados:

- Criar destino de conversao unico por workspace.
- Impedir mais de um destino ativo por workspace.
- Adicionar multiplas contas de anuncio para relatorio.
- Sync percorre todas as contas ativas.
- Erro em uma conta nao bloqueia outra.
- Classificador marca WhatsApp por `destination_type`.
- Classificador marca WhatsApp por creative/CTA.
- Evidencia de lead real pode classificar como `detected_by_leads`.
- Override manual prevalece sobre classificacao automatica.
- Relatorios consolidam apenas itens WhatsApp por padrao.
- Filtros por BM/conta funcionam.
- Envio CAPI inclui `page_id` quando configurado.
- Evento CAPI bloqueia com diagnostico quando Pixel/Pagina principal estiver ausente.

## 13. Fora do Escopo Desta Spec

- Enviar conversoes para multiplos Pixels.
- Criar campanhas Meta pela plataforma.
- Editar orcamento/status de campanhas.
- IA de analise de conversa.
- WhatsApp Cloud API oficial.

## 14. Proximo Passo

Criar um plano de implementacao especifico para esta spec antes de mexer no codigo.

Ordem recomendada:

1. Migracoes e contratos compartilhados.
2. Backend de ativos Meta: destino de conversao e contas de relatorio.
3. Adapter Meta para Paginas, creatives e campos de destino.
4. Classificador de campanha WhatsApp.
5. Sync multi-conta.
6. Relatorios consolidados e filtros.
7. UI de Integracoes e revisao manual.
8. CAPI com `page_id`.
9. Diagnosticos/backoffice.
