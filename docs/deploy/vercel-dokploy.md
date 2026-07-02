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
API_PORT=3333
DATABASE_URL=postgresql://usuario:senha@host:5432/wpptrack
REDIS_URL=redis://host:6379
WPPTRACK_PLATFORM_ADMIN_EMAILS=admin@seudominio.com
WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS=9900
```

Auth propria e Google:

```env
AUTH_EXPOSE_DEV_TOKENS=false
EMAIL_PROVIDER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.seudominio.com/auth/google/callback
```

Meta:

```env
META_APP_ID=
META_APP_SECRET=
META_CAPI_ACCESS_TOKEN=
META_OAUTH_REDIRECT_URL=https://api.seudominio.com/integrations/meta/callback
META_GRAPH_API_VERSION=v21.0
META_OAUTH_SCOPES=ads_read,business_management,read_insights
META_TOKEN_ENCRYPTION_KEY=troque-por-chave-forte-de-32-bytes-ou-mais
META_WEBHOOK_VERIFY_TOKEN=troque-por-token-forte-do-webhook-meta
```

Uazapi:

```env
UAZAPI_BASE_URL=
UAZAPI_TOKEN=
```

Asaas:

```env
ASAAS_BASE_URL=https://api.asaas.com/api/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_AUTH_TOKEN=
```

## Variaveis do Web

Na Vercel:

```env
NEXT_PUBLIC_API_URL=https://api.seudominio.com
```

## Build

Comandos esperados no monorepo:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Para a API em Dokploy, o processo deve executar:

```bash
pnpm --filter @wpptrack/api build
pnpm --dir apps/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @wpptrack/api start
```

## Ordem de Deploy

1. Provisionar PostgreSQL.
2. Provisionar Redis.
3. Configurar variaveis da API no Dokploy.
4. Rodar `prisma migrate deploy`.
5. Subir API.
6. Validar `GET /health/ready`.
7. Configurar variaveis do Web na Vercel.
8. Subir Web.
9. Cadastrar callbacks externos:
   - Google: `https://api.seudominio.com/auth/google/callback`
   - Meta OAuth: `https://api.seudominio.com/integrations/meta/callback`
   - Asaas webhook: `https://api.seudominio.com/webhooks/asaas`
   - Uazapi webhook: `https://api.seudominio.com/webhooks/uazapi`
   - Meta webhook: `https://api.seudominio.com/webhooks/meta`

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
