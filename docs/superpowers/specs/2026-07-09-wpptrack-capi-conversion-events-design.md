# WppTrack CAPI e Eventos de Conversao WhatsApp - Design Spec

Data: 2026-07-09

## 1. Objetivo

Fortalecer o modulo de Meta CAPI do WppTrack para enviar eventos reais de conversao vindos do WhatsApp, aproveitando o que ja funciona no projeto de referencia R100 WPP e adaptando ao desenho novo do WppTrack.

O modulo deve permitir testar e operar o caminho completo:

1. Lead ou evento chega pela Uazapi.
2. O backend identifica contexto de anuncio, telefone, etiquetas, palavra-chave e `ctwa_clid` quando existir.
3. O backend cria ou atualiza o lead.
4. O backend avalia regras de conversao.
5. O evento entra em uma fila de envio Meta CAPI.
6. O worker monta o payload correto de Business Messaging.
7. A Meta recebe o evento ou o WppTrack grava diagnostico claro dizendo por que nao enviou.

## 2. Referencia R100 WPP

Arquivos analisados no projeto `C:\Users\samue\Documents\r100-wpp`:

- `src/lib/meta-conversions.ts`: monta payload CAPI com `action_source="business_messaging"`, `messaging_channel="whatsapp"`, `ctwa_clid`, `page_id`, telefone hasheado e `custom_data`.
- `src/lib/meta-events.ts`: centraliza eventos suportados, labels e se o evento exige valor.
- `src/lib/keyword-conversion.ts`: detecta palavra-chave, busca lead, monta evento, registra historico e envia para Meta.
- `src/lib/purchase-conversion.ts`: processa Purchase vindo de plataformas/webhooks e deduplica por transacao.
- `docs/EVENTOS-KEYWORD-PIPELINE.md`: documenta eventos, extracao de valor e auditoria.

O WppTrack deve reaproveitar os principios, nao copiar literalmente a arquitetura do R100. O WppTrack ja tem NestJS, Prisma, BullMQ, diagnosticos estruturados, destino CAPI unico e Uazapi por instancia.

## 3. Decisoes

- O cliente nao preenche token CAPI manual.
- O envio deve usar o token OAuth Meta criptografado do workspace, com fallback tecnico apenas para token CAPI legado/global quando existir.
- O destino CAPI e unico por workspace: Pixel principal + Pagina Facebook principal em `MetaConversionDestination`.
- As multiplas contas/BMs servem para relatorios, nao para multiplos Pixels de conversao.
- `page_id` e obrigatorio para o destino operacional do evento Business Messaging.
- `ctwa_clid` deve ser capturado e enviado quando a Uazapi fornecer esse dado. Se nao existir, o evento pode ficar bloqueado ou ser enviado apenas quando a Meta aceitar o caso sem CTWA, conforme configuracao futura.
- `LeadSubmitted` deve poder ser disparado automaticamente no primeiro lead CTWA elegivel, com deduplicacao.
- `QualifiedLead`, `Purchase` e demais eventos devem ser disparados por regras de palavra-chave ou etiqueta.
- Eventos com valor nao podem ser enviados sem valor confiavel. Quando faltar valor para evento que exige `custom_data.value`, registrar diagnostico de bloqueio em vez de falso sucesso.
- As respostas e erros da Meta devem aparecer em diagnosticos e logs de integracao, sem expor token ou payload sensivel integral.

## 4. Abordagens Avaliadas

### 4.1 Copiar o R100 quase inteiro

Vantagem: acelera porque o fluxo existe.

Problemas: R100 e Next monolitico, tem modelo de usuario/campanhas diferente, token Meta em campos antigos e regras de CRM que nao existem no WppTrack. Copiar inteiro traria divida tecnica e conflito com o desenho de destino unico.

### 4.2 Manter o CAPI atual e apenas testar

Vantagem: menor mudanca.

Problemas: o payload atual do WppTrack ainda nao tem `ctwa_clid`, `messaging_channel`, `custom_data` completo para Purchase e bloqueios ricos. O teste real ficaria inconclusivo ou aceitaria evento pobre.

### 4.3 Adaptar o contrato do R100 ao backend atual do WppTrack

Recomendado.

Mantem a arquitetura atual do WppTrack e adiciona o que falta: parser de contexto WhatsApp/CTWA, registry de eventos, payload builder robusto, dados de valor, teste CAPI e diagnosticos melhores.

## 5. Eventos Suportados

O registry inicial deve ser inspirado no R100:

### Eventos sem valor obrigatorio

- `LeadSubmitted`
- `QualifiedLead`
- `OrderShipped`
- `OrderDelivered`
- `OrderCanceled`
- `OrderReturned`
- `RatingProvided`
- `ReviewProvided`

### Eventos com valor/custom_data

- `ViewContent`
- `AddToCart`
- `CartAbandoned`
- `InitiateCheckout`
- `Purchase`
- `OrderCreated`

Para a primeira validacao real, os testes devem cobrir obrigatoriamente:

- `LeadSubmitted`
- `QualifiedLead`
- `Purchase`

Os demais eventos podem entrar no registry e na UI se o payload builder ja souber bloquear os casos sem dados suficientes.

## 6. Dados Necessarios

### 6.1 Lead

O lead precisa guardar o contexto minimo para CAPI:

- `phoneHash`: ja existe.
- `campaignId`, `adSetId`, `adId`: ja existem.
- `ctwaClid`: novo campo recomendado.
- `ctwaSourceUrl`: opcional, para diagnostico.
- `firstMessageAt` e `lastMessageAt`: ja existem.
- `labels`: ja existe.

O `ctwaClid` nao deve aparecer em tela comum do cliente como dado principal. Ele pode aparecer mascarado em diagnostico/backoffice.

### 6.2 ConversionEventLog

O log de conversao deve guardar o suficiente para reenviar, auditar e testar:

- `eventName`
- `eventId` ou `dedupeKey`
- `sourceTrigger`: `auto_lead`, `keyword`, `whatsapp_label`, `manual_test`
- `phoneHash`
- `ctwaClid`
- `pixelId`
- `pageId`
- `campaignId`
- `adSetId`
- `adId`
- `customData`
- `valueCents`
- `currency`
- `contentName`
- `status`
- `providerResponseSummary`
- `errorCode`
- `errorMessage`

O token Meta nunca deve ser salvo nesse log.

### 6.3 ConversionRule

As regras existentes continuam:

- `keyword`
- `whatsapp_label`
- `eventName`
- `matchMode`
- `active`

Para eventos com valor, a regra deve poder ter defaults operacionais:

- moeda padrao.
- valor padrao opcional.
- nome do produto/conteudo opcional.
- itens padrao opcionais.

As formulas finais de receita/ROAS podem evoluir depois em outro modulo. Este modulo apenas garante que, quando houver valor confiavel, o CAPI consegue enviar corretamente.

## 7. Parser Uazapi / WhatsApp

O parser deve extrair dados de formatos top-level e aninhados:

- Texto da mensagem: `message.text`, `message.body`, `body`, `text`, `messageText`.
- Etiquetas: `labels`, `label`, `chat.labels`, objetos com `name`, `title` ou `label`.
- Telefone: `phone`, `from`, `sender`, `contact.phone`, `chat.phone`.
- Nome: `name`, `contactName`, `pushName`, `contact.name`.
- Atribuicao:
  - `campaignId`, `campaign_id`, `utm_campaign`.
  - `adSetId`, `adset_id`, `ad_set_id`, `utm_adset`.
  - `adId`, `ad_id`, `sourceId`, `source_id`.
  - `message.referral`, `context.referral`, `ads_context_data`.
- CTWA:
  - `ctwa_clid`
  - `ctwaClid`
  - `message.referral.ctwa_clid`
  - `message.referral.ctwaClid`
  - `context.referral.ctwa_clid`
  - `context.referral.ctwaClid`

`ctwaPayload` ou blobs internos nao devem ser usados como `ctwa_clid` se aparecerem. O R100 registrou que esse dado pode ser rejeitado pela Meta.

## 8. Fluxos

### 8.1 LeadSubmitted automatico

Quando a Uazapi receber uma primeira mensagem com contexto de anuncio elegivel:

1. Resolver workspace/instancia pela URL por instancia ou `providerInstanceId`.
2. Criar/atualizar lead.
3. Se tiver `adId` e `ctwaClid`, criar `ConversionEventLog` para `LeadSubmitted` com `sourceTrigger="auto_lead"`.
4. Usar dedupe por workspace + lead + `LeadSubmitted` + ad.
5. Enfileirar envio.
6. Se faltar Pixel/Pagina/token/CTWA, registrar estado bloqueado ou pendente com motivo claro.

### 8.2 Eventos por palavra-chave

Quando a mensagem contem uma palavra-chave ativa:

1. Avaliar regras `keyword`.
2. Criar `ConversionEventLog` para cada regra.
3. Para eventos com valor, usar dados configurados na regra ou dados passados pelo futuro modulo de formulas/extracao.
4. Enfileirar envio quando o log estiver completo.

### 8.3 Eventos por etiqueta

Quando a Uazapi informar uma etiqueta:

1. Avaliar regras `whatsapp_label`.
2. Criar logs com o mesmo contrato dos eventos por palavra-chave.
3. Deduplicar por lead + regra + evento + ad.

### 8.4 Teste manual

Backoffice ou endpoint interno deve permitir disparar um teste controlado:

- Escolher workspace.
- Escolher lead ou informar dados minimos.
- Escolher evento.
- Informar `test_event_code` da Meta.
- Enviar para o Pixel/Pagina principal do workspace.
- Mostrar resposta da Meta e criar `IntegrationLog`/`DiagnosticEvent`.

Esse teste nao deve exigir que o usuario final veja token manual.

## 9. Payload Meta CAPI

Payload esperado para Business Messaging:

```json
{
  "data": [
    {
      "event_name": "QualifiedLead",
      "event_time": 1783640000,
      "event_id": "workspace_lead_event_ad",
      "action_source": "business_messaging",
      "messaging_channel": "whatsapp",
      "user_data": {
        "ph": ["hash_do_telefone"],
        "ctwa_clid": "clid_do_clique",
        "page_id": "pagina_principal"
      },
      "custom_data": {
        "ad_id": "id_do_anuncio"
      }
    }
  ],
  "test_event_code": "TEST123"
}
```

Para `Purchase`, `custom_data` deve incluir quando disponivel:

- `value`
- `currency`
- `order_id`
- `content_name`
- `content_type`
- `contents`
- `num_items`

## 10. Status e Diagnosticos

Status recomendados para `ConversionEventLog`:

- `pending_meta_context`: falta ad/ctwa/contexto de anuncio.
- `pending_value`: evento exige valor e ainda nao ha valor confiavel.
- `ready_to_send`: pronto para fila.
- `queued`: colocado na fila.
- `sent`: Meta recebeu com sucesso.
- `error`: Meta recusou ou chamada falhou.
- `not_configured`: faltou Pixel, Pagina, token ou destino CAPI.
- `skipped`: nao deveria enviar, por dedupe ou regra.

Codigos de erro recomendados:

- `MissingMetaDestination`
- `MissingAccessToken`
- `MissingPhoneHash`
- `MissingCtwaClid`
- `MissingAdId`
- `EventValueMissing`
- `MetaCapiRejected`
- `MetaCapiNetworkError`

O backoffice deve permitir filtrar esses erros por workspace, lead, campanha, anuncio e periodo.

## 11. Testes

### 11.1 Automatizados

- Payload builder cria `business_messaging` com `messaging_channel="whatsapp"`.
- Payload builder inclui `ctwa_clid` quando recebido.
- Payload builder inclui `page_id` do `MetaConversionDestination`.
- `Purchase` com valor cria `custom_data` completo.
- `Purchase` sem valor fica `pending_value` ou `not_configured`, sem chamar Meta.
- Uazapi webhook com `message.referral.ctwa_clid` cria lead com `ctwaClid`.
- Uazapi webhook com palavra-chave gera `ConversionEventLog`.
- Uazapi webhook com etiqueta gera `ConversionEventLog`.
- Webhook duplicado nao cria conversao duplicada.
- Token Meta descriptografado nao aparece em `IntegrationLog`, `DiagnosticEvent` ou resposta HTTP.
- Envio teste com `test_event_code` inclui o codigo no corpo enviado.

### 11.2 Manual controlado

1. Conectar Meta no workspace.
2. Selecionar Pixel + Pagina principal.
3. Criar ou identificar um lead real vindo de campanha WhatsApp.
4. Criar regra `QualifiedLead` por palavra-chave.
5. Obter `test_event_code` no Events Manager da Meta.
6. Enviar mensagem que bate na palavra-chave ou usar o endpoint de teste.
7. Conferir:
   - `ConversionEventLog` saiu de `ready_to_send` para `sent`.
   - `IntegrationLog` tem `events_received=1`.
   - Events Manager mostra o evento de teste.

## 12. O Que Consigo Implementar Sem Nova Ajuda

- Registry de eventos.
- Parser Uazapi para `ctwa_clid`.
- Campos Prisma para CTWA/custom data.
- Payload builder CAPI inspirado no R100.
- Melhorias no adapter Meta CAPI.
- Fila e diagnosticos de envio.
- Testes unitarios e de webhook.
- Endpoint/backoffice interno de teste CAPI.
- Atualizacao da documentacao do projeto.

## 13. O Que Depende de Voce

- Fornecer um `test_event_code` da Meta para teste real no Events Manager.
- Quando possivel, fornecer um payload real da Uazapi com CTWA/referral para comparar com o parser. Pode vir com telefone, token e dados pessoais mascarados.
- Confirmar depois, no modulo de formulas, quais eventos com valor terao valor padrao, valor extraido da conversa ou valor calculado por outra fonte.

## 14. Fora do Escopo Desta Spec

- Fechar formulas finais de ROAS/receita.
- Criar IA de extracao de valor da conversa.
- Criar chat interno na plataforma.
- Enviar para multiplos Pixels.
- Reescrever layout geral de Integracoes/Relatorios.
- Migrar para WhatsApp Cloud API oficial.

## 15. Proximo Passo

Depois da aprovacao desta spec, criar o plano de implementacao com foco em:

1. Contratos e migrations.
2. Parser Uazapi/CTWA.
3. Registry e payload builder CAPI.
4. Worker/envio/diagnosticos.
5. Teste manual com `test_event_code`.
6. Atualizacao do `Projeto.md` apos a implementacao.
