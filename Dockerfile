# syntax=docker/dockerfile:1.7

FROM node:22-bookworm AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:/usr/local/bin:${PATH}"

RUN corepack enable \
  && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=wpptrack-api-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --filter @wpptrack/api...

FROM deps AS build

COPY . .

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wpptrack"

RUN pnpm --dir apps/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @wpptrack/shared build
RUN pnpm --filter @wpptrack/api build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app ./

EXPOSE 3000

CMD ["sh", "-c", "pnpm --dir apps/api exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter @wpptrack/api start"]
