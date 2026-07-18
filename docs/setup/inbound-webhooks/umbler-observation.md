# Umbler Talk - Webhook nativo em observacao

Este guia ativa a primeira conexao nativa da Umbler Talk no WppTrack.

O recurso esta deliberadamente limitado ao modo de observacao. Ele recebe,
autentica, criptografa, classifica e exibe as entregas, mas nao:

- cria ou atualiza leads;
- registra conversas no ledger de producao;
- cria eventos de conversao;
- envia eventos para a Meta CAPI;
- altera conexoes Meta, MySQL externo, Uazapi ou Asaas existentes.

Nao configure este teste no workspace Barbieri.

## 1. Variaveis da API

Adicione as variaveis abaixo somente ao servico da API:

```env
API_PUBLIC_URL=https://wpptrack-api.rastrack.app
INBOUND_WEBHOOKS_ENABLED=false
INBOUND_WEBHOOK_ENCRYPTION_KEY=
```

`API_PUBLIC_URL` deve ser apenas a origem HTTPS publica da API, sem caminho,
query string, credenciais ou barra adicional.

Gere uma chave exclusiva de 32 bytes em Base64:

```bash
openssl rand -base64 32
```

Alternativa com Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Salve o resultado inteiro em `INBOUND_WEBHOOK_ENCRYPTION_KEY`. Nao reutilize
chaves da Meta, SMTP ou MySQL externo e nao mostre o valor em logs, prints ou
comandos de verificacao.

A chave atual precisa permanecer estavel. Troca-la torna os payloads ainda
retidos impossiveis de descriptografar. A rotacao versionada da chave global
nao faz parte desta etapa.

## 2. Ordem segura de deploy

1. Salve `API_PUBLIC_URL`, a chave e
   `INBOUND_WEBHOOKS_ENABLED=false` na API.
2. Faca o deploy da migration e da API.
3. Confirme que a API iniciou sem rollback e que as integracoes existentes
   continuam saudaveis.
4. Faca o deploy da aplicacao web.
5. Mude apenas `INBOUND_WEBHOOKS_ENABLED` para `true`.
6. Faca um novo deploy da API.
7. Confirme novamente a saude da API e das integracoes existentes.

O recurso desativado nao exige chave valida e nao aceita entregas. Quando
ativado, uma chave ou URL publica invalida impede a API de iniciar.

## 3. Criar a conexao de observacao

1. Entre no workspace de teste com acesso de gestor da equipe.
2. Abra `Integracoes`.
3. Localize `Webhooks de plataformas WhatsApp`.
4. Clique em `Adicionar conexao`.
5. Selecione `Umbler Talk`.
6. Informe um nome operacional, por exemplo `Umbler - conta teste`.
7. Clique em `Gerar webhook`.
8. Copie imediatamente a URL exibida.

A URL completa contem um segredo opaco na query `token`. Ela aparece uma unica
vez e nao pode ser recuperada depois. O backend persiste apenas o hash do
segredo.

Uma conexao pode descobrir varios numeros/canais da Umbler. O mesmo workspace
tambem pode ter varias conexoes Umbler separadas.

## 4. Registrar a URL na Umbler

1. Abra a conta de teste na Umbler Talk.
2. Acesse a area de configuracao de webhooks.
3. Cadastre a URL completa gerada pelo WppTrack.
4. Preserve o caminho e o parametro `token` exatamente como foram gerados.
5. Se a Umbler permitir selecionar eventos, habilite os eventos de mensagem.
6. Salve e mantenha a conexao no modo de observacao no WppTrack.

Nao envie `workspaceId` por header ou payload. O WppTrack deriva o workspace
exclusivamente da conexao autenticada.

O endpoint publico responde `202` depois que a entrega foi armazenada de forma
duravel. Um token ausente, alterado, rotacionado ou removido recebe uma resposta
generica e nao revela se o workspace ou a conexao existem.

## 5. Rotacionar, pausar ou remover

### Rotacionar URL

1. Em `Integracoes`, abra a conexao.
2. Clique em `Gerar nova URL`.
3. Copie a nova URL exibida uma unica vez.
4. Substitua a URL na Umbler.

A URL anterior deixa de autenticar imediatamente.

### Pausar

Use `Pausar` para interromper novas observacoes sem apagar a conexao, canais,
rotas ou historico.

### Remover

`Remover` cria um tombstone. O historico redigido permanece disponivel para
auditoria, mas a URL deixa de aceitar entregas.

## 6. Teste controlado

Antes do primeiro evento, registre os totais atuais de:

- leads;
- tracking events;
- conversion logs;
- jobs CAPI;
- entregas e eventos inbound.

Gere, nesta ordem:

1. mensagem inbound com CTWA no canal A;
2. retry ou repeticao da mesma entrega;
3. mensagem inbound organica no canal A;
4. mensagem inbound com CTWA no canal B;
5. mensagem outbound enviada por membro;
6. nota privada, se a Umbler expuser esse evento;
7. CTWA associado a um anuncio Meta conhecido;
8. CTWA com anuncio desconhecido.

Resultados esperados:

| Caso | Classificacao esperada |
| --- | --- |
| CTWA com uma rota Meta exata | `eligible_route_resolved` |
| CTWA sem rota unica | `eligible_route_unresolved` |
| Mensagem organica | `ignored_no_ctwa` |
| Mensagem outbound | `ignored_outbound` |
| Nota privada | `ignored_private` |
| Evento nao reconhecido | `unsupported_event` |
| Payload invalido | `invalid_payload` |

Uma repeticao com o mesmo `EventId` incrementa a tentativa da entrega e nao
cria trabalho duplicado. A deduplicacao do evento normalizado tambem independe
de retries da entrega.

Ao final, os totais de leads, tracking events, conversion logs e jobs CAPI
devem permanecer exatamente iguais ao baseline.

## 7. Canais e rotas Meta

Depois das primeiras entregas, a tela de integracoes lista os canais
descobertos. Cada canal usa a identidade estavel informada pela Umbler e pode
representar um numero conectado.

Um canal pode apontar para varios BMs, e o mesmo BM pode ser associado a varios
canais. Em cada rota tambem e possivel restringir:

- conta de anuncios;
- destino de conversao com Pixel/Dataset e Pagina.

O WppTrack resolve a rota apenas quando existe uma correspondencia exata e
unica dentro das rotas permitidas. Ausencia ou ambiguidade permanece bloqueada
e visivel como `eligible_route_unresolved`.

## 8. Inspecao pelo platform owner

1. Abra o backoffice.
2. Entre em `Webhooks WhatsApp`.
3. Filtre o provedor por `Umbler`.
4. Inspecione a entrega desejada.

A listagem carrega apenas metadados redigidos. O payload bruto e
descriptografado somente ao abrir uma entrega individual e somente para o
platform owner. Cada tentativa de acesso gera auditoria.

O payload bruto:

- usa AES-256-GCM;
- fica vinculado ao workspace, conexao e entrega;
- nunca e gravado em texto puro;
- e fisicamente apagado depois de sete dias;
- fica mascarado quando o modo apresentacao esta ativo.

Depois da expiracao, metadados seguros, eventos normalizados e auditorias
permanecem, mas o JSON bruto nao pode mais ser aberto.

## 9. Diagnosticos e recuperacao

A manutencao da API roda apenas quando o recurso esta ativo. Ela:

- limpa em lotes payloads criptografados vencidos;
- recupera entregas aceitas cuja publicacao na fila falhou;
- usa claim no banco e job ID deterministico para varias replicas;
- bloqueia conexoes pausadas ou removidas;
- marca parser ausente, aposentado ou inconsistente para revisao;
- registra apenas codigos e identificadores operacionais redigidos.

Erros de Redis, banco, payload ou segredo nao sao copiados para o diagnostico.

## 10. Rollback

Para interromper o teste sem afetar outras integracoes:

1. Pause todas as conexoes Umbler criadas para o teste.
2. Mude `INBOUND_WEBHOOKS_ENABLED` para `false`.
3. Faca redeploy somente da API.
4. Confirme a saude das integracoes existentes.

Nao reverta a migration e nao apague tabelas. Elas sao aditivas e ficam
inertes com o recurso desativado.

## 11. Limite desta etapa

Uma classificacao `eligible_route_resolved` significa apenas que o evento esta
pronto para ser analisado com uma rota Meta unica. Ela nao certifica o parser e
nao promove a conexao para producao.

A ativacao de leads, ledger e CAPI exige uma etapa futura, com payload real
validado, reconciliacao dos baselines e aprovacao explicita.
