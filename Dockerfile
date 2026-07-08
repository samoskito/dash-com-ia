FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME="/usr/local/share/pnpm"
ENV PATH="${PNPM_HOME}:/usr/local/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.0

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

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
