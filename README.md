# WppTrack SaaS

WppTrack is a SaaS for final customers who run WhatsApp lead campaigns through Meta Ads.

The platform connects WhatsApp, Meta Ads and Pixel data to show:

- Campaign, ad set and ad performance.
- Real WhatsApp leads.
- Conversion events sent to Meta Pixel.
- Operational diagnostics for owners of the platform.

## Stack

- Web: Next.js on Vercel.
- API: NestJS on VPS/Dokploy.
- Database: PostgreSQL with Prisma.
- Jobs: Redis/BullMQ.
- Billing: Asaas.
- WhatsApp provider: Uazapi first, Cloud API later.

## Local Development

```bash
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm dev
```

## Project Memory

Read `Projeto.md` before changing product direction, architecture or implementation order.
