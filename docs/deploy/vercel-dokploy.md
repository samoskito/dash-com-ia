# Deploy WppTrack: Vercel + Dokploy

Este guia registra a arquitetura operacional aprovada para colocar o WppTrack em producao.

## Topologia

- **Web Next.js**: Vercel, apontando para `apps/web`.
- **API NestJS**: VPS/Dokploy, apontando para `apps/api`.
- **Banco**: PostgreSQL, em Dokploy ou servico gerenciado.
- **Fila/cache**: Redis, em Dokploy ou servico gerenciado.
- **Workers BullMQ**: mesmo processo NestJS por enquanto, com Redis compartilhado.
- **Webhooks externos**: Meta, Uazapi e Asaas apontam para a URL publica da API.

## Healthchecks

- Liveness da API: `GET /health`
  - Retorna `200` quando o processo NestJS esta vivo.
- Readiness da API: `GET /health/ready`
  - Retorna `200` quando PostgreSQL e Redis respondem.
  - Retorna `503` quando algum componente essencial falha.

No Dokploy, use `/health/ready` como healthcheck da API.

## Variaveis da API

Obrigatorias para subir a API:

```env
NODE_ENV=production
WEB_ORIGIN=https://app.seudominio.com
API_PUBLIC_URL=https://api.seudominio.com
API_PORT=3333
DATABASE_URL=postgresql://usuario:senha@host:5432/wpptrack
REDIS_URL=redis://host:6379
WPPTRACK_PLATFORM_ADMIN_EMAILS=admin@seudominio.com
WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS=9900
AUTH_PUBLIC_REGISTRATION_ENABLED=false
AUTH_COOKIE_DOMAIN=.seudominio.com
```

Auth propria e Google:

```env
AUTH_PUBLIC_REGISTRATION_ENABLED=false
AUTH_COOKIE_DOMAIN=.seudominio.com
AUTH_EXPOSE_DEV_TOKENS=false
EMAIL_PROVIDER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.seudominio.com/auth/google/callback
```

Quando frontend e API usam subdominios diferentes, por exemplo `app.seudominio.com`
e `api.seudominio.com`, `AUTH_COOKIE_DOMAIN` precisa apontar para o dominio raiz
compartilhado (`.seudominio.com`). Sem isso, a API autentica corretamente, mas o
frontend nao recebe o cookie `wpptrack_session` no middleware.

Meta:

```env
META_APP_ID=
META_APP_SECRET=
META_CONNECTION_MODES=oauth
META_CAPI_ACCESS_TOKEN=
META_OAUTH_REDIRECT_URL=https://api.seudominio.com/integrations/meta/callback
META_GRAPH_API_VERSION=v21.0
META_OAUTH_SCOPES=ads_read,ads_management,business_management,pages_show_list,pages_read_engagement
META_TOKEN_ENCRYPTION_KEY=troque-por-chave-forte-de-32-bytes-ou-mais
META_WEBHOOK_VERIFY_TOKEN=troque-por-token-forte-do-webhook-meta
```

A conexao por token permanente e habilitada de forma controlada com
`META_CONNECTION_MODES=oauth,manual`. O OAuth continua sendo a opcao principal.
Consulte [Conexao manual com a Meta](../setup/meta-manual-connections.md) antes
de liberar o modo manual em producao.

O `POST /webhooks/meta` valida automaticamente `X-Hub-Signature-256` com
`META_APP_SECRET` e associa o evento a um unico workspace pelo Page ID. Nao
envie nem confie em `x-workspace-id` como origem do tenant.

Uazapi:

```env
UAZAPI_BASE_URL=
UAZAPI_ADMIN_TOKEN=
UAZAPI_TOKEN=
UAZAPI_WEBHOOK_AUTH_TOKEN=
```

Asaas:

```env
ASAAS_BASE_URL=https://api.asaas.com/api/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_AUTH_TOKEN=
```

`UAZAPI_WEBHOOK_AUTH_TOKEN` e `ASAAS_WEBHOOK_AUTH_TOKEN` sao obrigatorios para
as respectivas rotas publicas; sem o segredo configurado, a API falha fechada
com `401`.

## Variaveis do Web

Na Vercel:

```env
NEXT_PUBLIC_API_URL=https://api.seudominio.com
AUTH_GOOGLE_ENABLED=false
```

Na API, mantenha `AUTH_GOOGLE_ENABLED=false` enquanto o login Google nao estiver
liberado para o produto. Para preparar SMTP sem habilitar envio antes da hora:

```env
EMAIL_PROVIDER=
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM_NAME=WppTrack
EMAIL_FROM_ADDRESS=noreply@rastrack.app
EMAIL_REPLY_TO=suporte@rastrack.app
```

Ative somente depois de autenticar o dominio remetente na Brevo e validar em
staging:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
```

`SMTP_USER` recebe o login SMTP da Brevo. `SMTP_PASSWORD` recebe uma chave SMTP
da Brevo, nunca uma API key. O relay usa STARTTLS obrigatorio na porta 587.
`/health/ready` valida apenas o formato seguro da configuracao e informa
`email: disabled` ou `email: ok`; o healthcheck nao envia mensagens.

Os envelopes da fila sao criptografados com uma chave derivada da chave SMTP e
nao carregam token, link, destinatario ou corpo em texto aberto no Redis. Antes
de rotacionar `SMTP_PASSWORD`, pause novos disparos e deixe a fila
`transactional-email` terminar; depois da troca, reenvie apenas entregas que
ainda estavam pendentes.

## Resgate de licença (base de alunos)

O resgate consulta `palm_up.Transacoes`. Crie no MySQL um usuario dedicado com
acesso somente de leitura (`SELECT`) a essa tabela. Nao reutilize um usuario com
permissao de escrita e nunca coloque credenciais MySQL na Vercel ou em variaveis
`NEXT_PUBLIC_*`.

Variaveis da API no Dokploy:

```env
LICENSE_CLAIM_ENABLED=
LICENSE_CLAIM_MYSQL_HOST=
LICENSE_CLAIM_MYSQL_PORT=
LICENSE_CLAIM_MYSQL_DATABASE=
LICENSE_CLAIM_MYSQL_USER=
LICENSE_CLAIM_MYSQL_PASSWORD=
LICENSE_CLAIM_MYSQL_SSL_MODE=
LICENSE_CLAIM_MYSQL_SSL_CA=
LICENSE_CLAIM_MYSQL_CONNECT_TIMEOUT_MS=
LICENSE_CLAIM_MYSQL_QUERY_TIMEOUT_MS=
LICENSE_CLAIM_MYSQL_POOL_SIZE=
LICENSE_CLAIM_PRODUCT_SKU=
LICENSE_CLAIM_INTERVAL=
LICENSE_CLAIM_WHATSAPP_NOTIFY_ENABLED=
LICENSE_CLAIM_TURNSTILE_SECRET_KEY=
```

Defaults da API: porta MySQL `3306`, timeouts de conexao e consulta `5000` ms,
pool com `3` conexoes, SKU `rastrackdash_student_claim`, intervalo `annual` e
notificacao por WhatsApp desabilitada. `LICENSE_CLAIM_MYSQL_SSL_MODE` aceita
`disabled`, `required` ou `verify_identity`; o CA e opcional. O segredo do
Turnstile vazio desabilita a verificacao de captcha.

Variaveis publicas do Web na Vercel:

```env
NEXT_PUBLIC_LICENSE_CLAIM_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_LICENSE_CLAIM_SUPPORT_EMAIL=
```

O kill switch e `LICENSE_CLAIM_ENABLED`. Ausente, vazio ou com qualquer valor
diferente de `true`, ele assume `false` e os endpoints de resgate respondem
`503 license_claim_disabled`. Em rollback, defina explicitamente
`LICENSE_CLAIM_ENABLED=false` no Dokploy e reinicie a API.

### Stop-before-apply e ordem de habilitacao

**STOP antes de aplicar a migracao:** o `Dockerfile` executa
`prisma migrate deploy` quando o container inicia. Portanto, fazer deploy de
uma imagem que contenha a migracao tambem aplica a migracao. Nao faça merge nem
deploy ate a migracao `LicenseClaim` ser revisada e sua aplicacao no ambiente
ser explicitamente aprovada.

Depois da aprovacao, habilite nesta ordem:

1. Registrar a aprovacao da migracao.
2. Fazer o deploy da API; o boot aplica a migracao aprovada.
3. Configurar no Dokploy as variaveis MySQL, usando o usuario somente leitura.
4. Definir `LICENSE_CLAIM_ENABLED=true` e reiniciar a API.
5. Executar em staging os smokes A1-A8 abaixo antes de habilitar producao.

### Smoke A1-A8 (staging)

| ID | Cenario | Resultado esperado |
|---|---|---|
| A1 | Email de aluno elegivel em `Transacoes` | O codigo chega por email, a chave e revelada e uma instalacao nova ativa com `200` e `bound:true` |
| A2 | Repetir o resgate com o mesmo email | A mesma chave e revelada e nenhuma segunda licenca e criada |
| A3 | Email ausente da base | A tela mostra a mesma mensagem generica de A1 apos a solicitacao e nenhum email chega |
| A4 | Compra nao paga ou produto nao elegivel | Mesmo resultado de A3 |
| A5 | Ativar a chave de A1 com outra `accountIdentity` | A API responde `403 license_account_mismatch` |
| A6 | Remover temporariamente as credenciais MySQL | A tela continua generica, o log mostra `mysql_unavailable:not_configured` e `/health/ready` continua `200` |
| A7 | Definir `LICENSE_CLAIM_ENABLED=false` | Os endpoints respondem `503` e a pagina mostra que o resgate esta indisponivel |
| A8 | Procurar nos logs por `PALMUP-` e pelo email usado em A1-A7 | Somente o `keyPrefix` pode aparecer; a chave completa e o email nao podem aparecer |

## Build

Comandos esperados no monorepo:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Para a API em Dokploy, use **Build Type: Dockerfile** com o `Dockerfile` da raiz do repositorio. O container executa automaticamente:

```bash
pnpm --dir apps/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @wpptrack/api start
```

O build da imagem instala dependencias com pnpm, compila `packages/shared`, compila `apps/api` e roda `prisma generate`. O caminho Nixpacks foi abandonado para este projeto porque apresentou instabilidade com pnpm/Corepack no build remoto do Dokploy.

## Ordem de Deploy

1. Provisionar PostgreSQL.
2. Provisionar Redis.
3. Configurar variaveis da API no Dokploy.
4. Configurar Build Type como `Dockerfile`.
5. Subir API; o container roda `prisma migrate deploy` ao iniciar.
6. Validar `GET /health/ready`.
7. Configurar variaveis do Web na Vercel.
8. Subir Web.
9. Cadastrar callbacks externos:
   - Google: `https://api.seudominio.com/auth/google/callback`
   - Meta OAuth: `https://api.seudominio.com/integrations/meta/callback`
   - Asaas webhook: `https://api.seudominio.com/webhooks/asaas`
   - Uazapi webhook por instancia: o backend configura automaticamente URLs no formato `https://api.seudominio.com/webhooks/uazapi/instances/{whatsappInstanceId}?token={token-gerado}` quando a instancia e criada na Uazapi.
   - Meta webhook: `https://api.seudominio.com/webhooks/meta`

## Acoes Manuais de Dominio e Meta

1. Escolha um subdominio novo para a API deste projeto. Nao reutilize callback de outro SaaS.
   - Exemplo de app: `app.wpptrack.seudominio.com`.
   - Exemplo de API: `api.wpptrack.seudominio.com`.
2. No DNS do dominio, crie o apontamento do subdominio da API para o servidor/Dokploy.
3. Depois que a API estiver publicada, valide no navegador:
   - `https://api.wpptrack.seudominio.com/health`
   - `https://api.wpptrack.seudominio.com/health/ready`
4. No `.env` da API, configure:
   - `WEB_ORIGIN=https://app.wpptrack.seudominio.com`
   - `API_PUBLIC_URL=https://api.wpptrack.seudominio.com`
   - `META_OAUTH_REDIRECT_URL=https://api.wpptrack.seudominio.com/integrations/meta/callback`
5. No painel da Meta, em URIs validas de redirecionamento OAuth, adicione exatamente:
   - `https://api.wpptrack.seudominio.com/integrations/meta/callback`
6. No produto de Webhooks da Meta, use:
   - Callback URL: `https://api.wpptrack.seudominio.com/webhooks/meta`
   - Verify token: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`.

## Validacao Pos-Deploy

Rodar:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --dir apps/api exec prisma migrate status --schema prisma/schema.prisma
```

Checks manuais:

- `GET /health` retorna `200`.
- `GET /health/ready` retorna `200`.
- Login email/senha funciona.
- Login Google redireciona de volta para `WEB_ORIGIN`.
- Backoffice so abre para emails em `WPPTRACK_PLATFORM_ADMIN_EMAILS`.
- Criacao de instancia WhatsApp permanece `pending_payment` ate webhook Asaas confirmado.
- Central de Diagnostico registra webhooks e permite retry auditado.

## Pendencias Antes do Deploy Real

- Definir dominios finais de app/API.
- Definir se PostgreSQL/Redis ficarao no Dokploy ou servicos gerenciados.
- Configurar provedor de email real para recuperacao de senha/verificacao.
- Confirmar credenciais e callbacks no app Meta existente.
- Confirmar contrato final da Uazapi para eventos de etiqueta.
