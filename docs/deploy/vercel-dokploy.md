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
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM_NAME=WppTrack
EMAIL_FROM_ADDRESS=noreply@rastrack.app
EMAIL_REPLY_TO=suporte@rastrack.app
```

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
