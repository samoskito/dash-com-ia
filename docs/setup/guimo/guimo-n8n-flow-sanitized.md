# Guimo/GIMO CRM — fluxo n8n sanitizado

> Fonte de contrato para a implementação Guimo. Este arquivo foi derivado do fluxo n8n fornecido pelo usuário, com credenciais, tokens, PII, URLs de webhook e conteúdo de mensagens removidos.
>
> Não usar este arquivo para armazenar segredos. Credenciais devem ser configuradas somente por secret manager/env no backend.

## Direção

Guimo/GIMO envia uma movimentação de estágio para um webhook do WppTrack. O WppTrack consulta a API do CRM para enriquecer o evento e envia a conversão correspondente para o pipeline interno Meta/CAPI.

## Payload do webhook observado

```json
{
  "id_negociacao": 2898966,
  "id_contato": 2841434,
  "id_usuario": null,
  "id_fonte": 14699,
  "id_anuncio": 22603,
  "estagio_anterior": {
    "id": 42247,
    "nome": "Análise de Viabilidade"
  },
  "estagio_novo": {
    "id": 42260,
    "nome": "Lead Qualificado"
  }
}
```

O payload observado não possui `event_id`, `movement_id`, timestamp da movimentação ou versão. A deduplicação provisória precisa ser documentada até a Guimo fornecer um identificador nativo.

## API do CRM observada

Base URL observada:

```text
https://integracao.agendasistemacrm.com.br
```

### Contato

```text
GET /api/v1/chat/contato/{id_contato}
```

A requisição original do n8n enviava headers de autenticação. Os valores foram removidos. A implementação deve receber esses valores por configuração segura no backend e nunca expô-los ao frontend, logs ou DTOs.

Campos operacionais relevantes observados na resposta:

```text
contato.telefone
contato.remoteJidAlt
chat.pushName
```

A resposta também contém campos que devem ser descartados na borda, incluindo token de instância, URL do provider, foto, mensagens, status de conversa e demais dados operacionais do WhatsApp.

O telefone pode vir como JID, por exemplo:

```text
<digits>@s.whatsapp.net
```

O backend deve remover o sufixo, normalizar o número e nunca registrar o valor cru em logs.

### Negociação

```text
GET /api/v1/crm/negociacoes/{id_negociacao}
```

Campos relevantes observados:

```text
Id
id_contato
id_estagio
valor
id_fonte
id_anuncio
CreatedAt
UpdatedAt
```

Para Purchase, o valor deve ser validado como positivo antes do envio. O exemplo observado tinha `valor: 0`; não enviar Purchase com valor zero ou ausente sem uma decisão de produto explícita.

## Regras de negócio

### Lead Qualificado

1. Receber uma transição cujo `estagio_novo` corresponda à configuração de Lead Qualificado do workspace.
2. Consultar o contato pelo `id_contato`.
3. Extrair nome e telefone/JID.
4. Normalizar o telefone.
5. Localizar o lead no WppTrack dentro do workspace correto.
6. Enviar a conversão de lead qualificado usando os dados internos autorizados.

### Compra

1. Receber uma transição cujo `estagio_novo` corresponda à configuração de Compra do workspace.
2. Consultar o contato pelo `id_contato`.
3. Consultar a negociação pelo `id_negociacao`.
4. Extrair nome, telefone/JID e valor positivo.
5. Localizar o lead no WppTrack dentro do workspace correto.
6. Enviar Purchase com valor validado e moeda definida pelo contrato interno.

### Correspondência de estágio

```text
ID configurado: comparação por ID;
sem ID: comparação por nome exato normalizado;
não usar correspondência parcial;
estagio_anterior deve ser diferente do estágio-alvo;
estagio_novo deve ser o estágio-alvo.
```

A decisão usa o `estagio_novo` recebido no webhook, não `id_estagio` retornado posteriormente pela API, pois a negociação pode avançar entre o webhook e a consulta.

## Dedupe provisório

Até existir `event_id`/`movement_id` oficial:

```text
provider + workspaceId + id_negociacao + id_contato + estagio_novo.id
```

A chave deve ser única no ledger e segura contra concorrência. Limitação conhecida: uma nova reentrada legítima no mesmo estágio poderá ser considerada duplicada.

## Campos descartados e segurança

Nunca persistir ou registrar:

```text
Authorization/Bearer
X-API-Key
qualquer token de instância
URLs de provider
conteúdo de mensagens
profilePicUrl
telefone cru
payload bruto sem redaction/encryption
```

A configuração deve ser por workspace, com credenciais cifradas no backend. O webhook deve usar autenticação própria fail-closed, independente das credenciais usadas para consultar a API do CRM.

## Dados ainda não definidos

```text
identificador nativo do evento/movimentação;
autenticação e headers oficiais do webhook WppTrack;
se Authorization e X-API-Key são ambos obrigatórios;
retry/status esperado pelo emissor;
sandbox da API;
rate limit e timeout oficial;
moeda e unidade do campo valor;
regra para contato/lead inexistente;
mapeamento conta Guimo → workspace;
```

Essas lacunas devem permanecer explícitas no código e nos testes; não inventar comportamento silencioso.
