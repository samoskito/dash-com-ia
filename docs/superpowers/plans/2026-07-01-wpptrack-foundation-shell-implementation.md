# WppTrack Foundation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working foundation of WppTrack SaaS: monorepo, Next.js client shell, NestJS API shell, shared contracts, local Postgres/Redis, and a complete navigable product skeleton using the approved design direction.

**Architecture:** This plan creates the "esqueleto navegavel completo + motor real por tras" foundation. The frontend renders all approved areas with typed mock data; the backend exposes health and typed mock endpoints shaped like the future real API; shared packages define roles, statuses, metrics, and DTO schemas used by both sides.

**Tech Stack:** pnpm workspaces, Next.js, React, NestJS, Prisma, PostgreSQL, Redis, BullMQ, Zod, Vitest, Playwright.

---

## Scope Check

The approved spec covers multiple independent subsystems: auth, workspaces, Meta OAuth, Uazapi, Asaas billing, reporting, backoffice diagnostics, jobs, and deployment. This plan intentionally implements only the foundation shell. It must produce working, testable software without connecting real external providers yet.

Follow-up implementation plans should cover:

- Auth/workspaces/permissions.
- Meta OAuth and reporting sync.
- Uazapi webhooks, leads, labels, and conversion triggers.
- Asaas subscriptions, payment-before-activation, and split.
- Backoffice diagnostics and replay actions.
- Production deployment.

## File Structure

Create this structure:

```txt
apps/
  api/
    src/
      app.module.ts
      main.ts
      health/
      mock/
      config/
      common/
    test/
  web/
    src/
      app/
        (app)/
        (backoffice)/
        login/
      components/
      lib/
      mock/
      styles/
    tests/
packages/
  shared/
    src/
      index.ts
      roles.ts
      statuses.ts
      metrics.ts
      navigation.ts
      schemas/
    tests/
docs/
  superpowers/
    specs/
    plans/
docker-compose.yml
pnpm-workspace.yaml
package.json
turbo.json
.env.example
```

Boundaries:

- `packages/shared`: pure TypeScript contracts and schemas, no React/Nest imports.
- `apps/web`: Next.js routes, layouts, and client-facing views.
- `apps/api`: NestJS modules, API routes, local config, and future integration boundaries.

## Task 1: Create Monorepo Foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create root `package.json`**

Create `package.json`:

```json
{
  "name": "wpptrack-saas",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "format": "prettier --write .",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "turbo": "^2.3.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create workspace config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create Turbo config**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

Create `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
.turbo/
.env
.env.local
.env.*.local
.superpowers/
*.log
```

- [ ] **Step 5: Create local environment example**

Create `.env.example`:

```bash
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3333
API_PORT=3333
DATABASE_URL=postgresql://wpptrack:wpptrack@localhost:5432/wpptrack
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=replace-me-access
JWT_REFRESH_SECRET=replace-me-refresh
META_APP_ID=
META_APP_SECRET=
META_OAUTH_REDIRECT_URL=http://localhost:3333/integrations/meta/callback
UAZAPI_BASE_URL=
UAZAPI_TOKEN=
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=
```

- [ ] **Step 6: Create local services**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: wpptrack
      POSTGRES_PASSWORD: wpptrack
      POSTGRES_DB: wpptrack
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: unless-stopped
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 7: Install root dependencies**

Run:

```bash
pnpm install
```

Expected: `node_modules` created and no install errors.

- [ ] **Step 8: Commit foundation config**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .env.example docker-compose.yml
git commit -m "chore: setup monorepo foundation"
```

## Task 2: Create Shared Domain Contracts

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/roles.ts`
- Create: `packages/shared/src/statuses.ts`
- Create: `packages/shared/src/metrics.ts`
- Create: `packages/shared/src/navigation.ts`
- Create: `packages/shared/src/schemas/workspace.ts`
- Create: `packages/shared/src/schemas/reporting.ts`
- Create: `packages/shared/tests/contracts.test.ts`

- [ ] **Step 1: Create package metadata**

Create `packages/shared/package.json`:

```json
{
  "name": "@wpptrack/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Add role contracts**

Create `packages/shared/src/roles.ts`:

```ts
export const workspaceRoles = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const platformRoles = ["platform_owner", "platform_operator"] as const;

export type PlatformRole = (typeof platformRoles)[number];

export function canManageWorkspaceBilling(role: WorkspaceRole): boolean {
  return role === "owner";
}

export function canManageIntegrations(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canViewReports(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}
```

- [ ] **Step 5: Add status contracts**

Create `packages/shared/src/statuses.ts`:

```ts
export const integrationStatuses = [
  "connected",
  "disconnected",
  "syncing",
  "error",
  "pending_payment",
  "needs_reconnect"
] as const;

export type IntegrationStatus = (typeof integrationStatuses)[number];

export const eventStatuses = ["pending", "sent", "failed", "retrying"] as const;

export type EventStatus = (typeof eventStatuses)[number];

export const whatsappInstanceStatuses = [
  "pending_payment",
  "active",
  "disconnected",
  "suspended",
  "error"
] as const;

export type WhatsappInstanceStatus = (typeof whatsappInstanceStatuses)[number];
```

- [ ] **Step 6: Add metrics contracts**

Create `packages/shared/src/metrics.ts`:

```ts
export const funnelMetricKeys = [
  "metaConversationsStarted",
  "realConversations",
  "leadSubmitted",
  "qualifiedLead",
  "purchase"
] as const;

export type FunnelMetricKey = (typeof funnelMetricKeys)[number];

export type MoneyCents = number;

export interface ReportMetric {
  key: string;
  label: string;
  value: number;
  costCents?: MoneyCents;
  unavailableReason?: string;
}

export interface CampaignReportRow {
  id: string;
  name: string;
  status: "active" | "paused" | "deleted" | "unknown";
  spendCents: MoneyCents;
  metaConversationsStarted: number;
  costPerMetaConversationCents: MoneyCents | null;
  realConversations: number;
  costPerRealConversationCents: MoneyCents | null;
  leadSubmitted: number;
  costPerLeadSubmittedCents: MoneyCents | null;
  qualifiedLead: number;
  costPerQualifiedLeadCents: MoneyCents | null;
  purchase: number;
  costPerPurchaseCents: MoneyCents | null;
  roas: number | null;
}
```

- [ ] **Step 7: Add navigation contracts**

Create `packages/shared/src/navigation.ts`:

```ts
export const clientNavigation = [
  { id: "overview", label: "Visao geral" },
  { id: "leads", label: "Leads" },
  { id: "reports", label: "Relatorios" },
  { id: "integrations", label: "Integracoes" },
  { id: "settings", label: "Configuracoes" }
] as const;

export const backofficeNavigation = [
  { id: "workspaces", label: "Workspaces" },
  { id: "billing", label: "Financeiro" },
  { id: "split", label: "Split" },
  { id: "diagnostics", label: "Diagnostico" }
] as const;

export type ClientNavId = (typeof clientNavigation)[number]["id"];
export type BackofficeNavId = (typeof backofficeNavigation)[number]["id"];
```

- [ ] **Step 8: Add workspace schema**

Create `packages/shared/src/schemas/workspace.ts`:

```ts
import { z } from "zod";
import { workspaceRoles } from "../roles";

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  role: z.enum(workspaceRoles)
});

export type WorkspaceDto = z.infer<typeof workspaceSchema>;
```

- [ ] **Step 9: Add reporting schema**

Create `packages/shared/src/schemas/reporting.ts`:

```ts
import { z } from "zod";

const moneyCentsSchema = z.number().int().nonnegative();

export const campaignReportRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "paused", "deleted", "unknown"]),
  spendCents: moneyCentsSchema,
  metaConversationsStarted: z.number().int().nonnegative(),
  costPerMetaConversationCents: moneyCentsSchema.nullable(),
  realConversations: z.number().int().nonnegative(),
  costPerRealConversationCents: moneyCentsSchema.nullable(),
  leadSubmitted: z.number().int().nonnegative(),
  costPerLeadSubmittedCents: moneyCentsSchema.nullable(),
  qualifiedLead: z.number().int().nonnegative(),
  costPerQualifiedLeadCents: moneyCentsSchema.nullable(),
  purchase: z.number().int().nonnegative(),
  costPerPurchaseCents: moneyCentsSchema.nullable(),
  roas: z.number().nonnegative().nullable()
});

export const reportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  campaigns: z.array(campaignReportRowSchema)
});

export type CampaignReportRowDto = z.infer<typeof campaignReportRowSchema>;
export type ReportOverviewDto = z.infer<typeof reportOverviewSchema>;
```

- [ ] **Step 10: Export shared API**

Create `packages/shared/src/index.ts`:

```ts
export * from "./roles";
export * from "./statuses";
export * from "./metrics";
export * from "./navigation";
export * from "./schemas/workspace";
export * from "./schemas/reporting";
```

- [ ] **Step 11: Add contract tests**

Create `packages/shared/tests/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  campaignReportRowSchema,
  clientNavigation
} from "../src";

describe("shared contracts", () => {
  it("does not include Clientes in client navigation", () => {
    expect(clientNavigation.map((item) => item.label)).not.toContain("Clientes");
  });

  it("keeps owner/admin/member permission basics", () => {
    expect(canManageWorkspaceBilling("owner")).toBe(true);
    expect(canManageWorkspaceBilling("admin")).toBe(false);
    expect(canManageIntegrations("admin")).toBe(true);
    expect(canViewReports("member")).toBe(true);
  });

  it("validates campaign report rows", () => {
    const parsed = campaignReportRowSchema.parse({
      id: "cmp_1",
      name: "Black Friday WhatsApp",
      status: "active",
      spendCents: 120000,
      metaConversationsStarted: 100,
      costPerMetaConversationCents: 1200,
      realConversations: 80,
      costPerRealConversationCents: 1500,
      leadSubmitted: 30,
      costPerLeadSubmittedCents: 4000,
      qualifiedLead: 12,
      costPerQualifiedLeadCents: 10000,
      purchase: 3,
      costPerPurchaseCents: 40000,
      roas: 4.2
    });

    expect(parsed.purchase).toBe(3);
  });
});
```

- [ ] **Step 12: Run shared tests**

Run:

```bash
pnpm install
pnpm --filter @wpptrack/shared test
```

Expected: 3 tests pass.

- [ ] **Step 13: Commit shared contracts**

```bash
git add packages/shared
git commit -m "feat: add shared WppTrack contracts"
```

## Task 3: Scaffold NestJS API Shell

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/mock/mock.controller.ts`
- Create: `apps/api/src/mock/mock.service.ts`
- Create: `apps/api/test/health.test.ts`

- [ ] **Step 1: Create API package**

Create `apps/api/package.json`:

```json
{
  "name": "@wpptrack/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/platform-express": "^10.4.4",
    "@wpptrack/shared": "workspace:*",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.4",
    "@types/node": "^22.7.4",
    "supertest": "^7.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create API TypeScript config**

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create API Vitest config**

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Add env helper**

Create `apps/api/src/config/env.ts`:

```ts
export function getApiPort(): number {
  const value = process.env.API_PORT ?? "3333";
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid API_PORT: ${value}`);
  }

  return parsed;
}
```

- [ ] **Step 5: Add health controller**

Create `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "wpptrack-api"
    };
  }
}
```

- [ ] **Step 6: Add mock service**

Create `apps/api/src/mock/mock.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import type { ReportOverviewDto } from "@wpptrack/shared";

@Injectable()
export class MockService {
  getReportOverview(): ReportOverviewDto {
    return {
      workspaceId: "workspace_demo",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_black_friday",
          name: "Black Friday WhatsApp",
          status: "active",
          spendCents: 120000,
          metaConversationsStarted: 176,
          costPerMetaConversationCents: 681,
          realConversations: 142,
          costPerRealConversationCents: 845,
          leadSubmitted: 61,
          costPerLeadSubmittedCents: 1967,
          qualifiedLead: 28,
          costPerQualifiedLeadCents: 4285,
          purchase: 9,
          costPerPurchaseCents: 13333,
          roas: 5.4
        }
      ]
    };
  }
}
```

- [ ] **Step 7: Add mock controller**

Create `apps/api/src/mock/mock.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common";
import { MockService } from "./mock.service";

@Controller("mock")
export class MockController {
  constructor(private readonly mockService: MockService) {}

  @Get("reports/overview")
  getReportOverview() {
    return this.mockService.getReportOverview();
  }
}
```

- [ ] **Step 8: Add app module**

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  controllers: [HealthController, MockController],
  providers: [MockService]
})
export class AppModule {}
```

- [ ] **Step 9: Add API bootstrap**

Create `apps/api/src/main.ts`:

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getApiPort } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  });

  await app.listen(getApiPort());
}

void bootstrap();
```

- [ ] **Step 10: Add API smoke test**

Create `apps/api/test/health.test.ts`:

```ts
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("API health", () => {
  it("returns service health", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          status: "ok",
          service: "wpptrack-api"
        });
      });

    await app.close();
  });
});
```

- [ ] **Step 11: Run API tests**

Run:

```bash
pnpm install
pnpm --filter @wpptrack/api test
```

Expected: health test passes.

- [ ] **Step 12: Commit API shell**

```bash
git add apps/api
git commit -m "feat: add NestJS API shell"
```

## Task 4: Scaffold Next.js Web Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/overview/page.tsx`
- Create: `apps/web/src/app/(app)/leads/page.tsx`
- Create: `apps/web/src/app/(app)/reports/page.tsx`
- Create: `apps/web/src/app/(app)/integrations/page.tsx`
- Create: `apps/web/src/app/(app)/settings/page.tsx`
- Create: `apps/web/src/app/(backoffice)/backoffice/page.tsx`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/mock/reporting.ts`
- Create: `apps/web/src/styles/globals.css`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@wpptrack/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "test": "vitest run",
    "lint": "next lint",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@wpptrack/shared": "workspace:*",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create Next config**

Create `apps/web/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wpptrack/shared"]
};

export default nextConfig;
```

- [ ] **Step 3: Create web TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Add global styles**

Create `apps/web/src/styles/globals.css`:

```css
:root {
  --teal-500: #0e8c7a;
  --signal-500: #12b884;
  --gray-50: #f6f8f7;
  --gray-100: #ecf0ef;
  --gray-200: #dce3e1;
  --gray-600: #4e5755;
  --gray-900: #18211f;
  --white: #ffffff;
  --bg-app: var(--gray-50);
  --bg-surface: var(--white);
  --border: var(--gray-200);
  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  --brand: var(--teal-500);
  --brand-subtle: #e6f4f1;
  --font-display: "Space Grotesk", "Hanken Grotesk", system-ui, sans-serif;
  --font-body: "Hanken Grotesk", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-body);
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 5: Add root layout**

Create `apps/web/src/app/layout.tsx`:

```tsx
import "../styles/globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "WppTrack",
  description: "Rastreamento de leads WhatsApp para Meta Ads"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Add app shell component**

Create `apps/web/src/components/app-shell.tsx`:

```tsx
import Link from "next/link";
import { clientNavigation } from "@wpptrack/shared";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "248px 1fr", minHeight: "100vh" }}>
      <aside style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)", padding: 16 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>WppTrack</strong>
        <nav style={{ display: "grid", gap: 6, marginTop: 24 }}>
          {clientNavigation.map((item) => (
            <Link
              key={item.id}
              href={`/${item.id}`}
              style={{
                borderRadius: 10,
                color: "var(--text-secondary)",
                fontWeight: 700,
                padding: "10px 12px"
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: Add app route group layout**

Create `apps/web/src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell } from "../../components/app-shell";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 8: Add home redirect page**

Create `apps/web/src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/overview");
}
```

- [ ] **Step 9: Add mock reporting data**

Create `apps/web/src/mock/reporting.ts`:

```ts
import type { ReportOverviewDto } from "@wpptrack/shared";

export const mockReportOverview: ReportOverviewDto = {
  workspaceId: "workspace_demo",
  rangeLabel: "Ultimos 7 dias",
  campaigns: [
    {
      id: "cmp_black_friday",
      name: "Black Friday WhatsApp",
      status: "active",
      spendCents: 120000,
      metaConversationsStarted: 176,
      costPerMetaConversationCents: 681,
      realConversations: 142,
      costPerRealConversationCents: 845,
      leadSubmitted: 61,
      costPerLeadSubmittedCents: 1967,
      qualifiedLead: 28,
      costPerQualifiedLeadCents: 4285,
      purchase: 9,
      costPerPurchaseCents: 13333,
      roas: 5.4
    }
  ]
};
```

- [ ] **Step 10: Add overview page**

Create `apps/web/src/app/(app)/overview/page.tsx`:

```tsx
import { mockReportOverview } from "../../../mock/reporting";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OverviewPage() {
  const first = mockReportOverview.campaigns[0];

  return (
    <section style={{ display: "grid", gap: 16, padding: 24 }}>
      <header>
        <p style={{ color: "var(--brand)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800 }}>
          VISAO GERAL
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", margin: 0 }}>Cockpit da operacao</h1>
      </header>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Metric label="Conversas Meta" value={String(first.metaConversationsStarted)} />
        <Metric label="Conversa real" value={String(first.realConversations)} />
        <Metric label="LeadSubmitted" value={String(first.leadSubmitted)} />
        <Metric label="Purchase" value={String(first.purchase)} />
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--bg-surface)", padding: 18 }}>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>Funil integrado</h2>
        <p>
          Investimento {money(first.spendCents)} gerou {first.realConversations} conversas reais,
          {` ${first.leadSubmitted}`} leads e {first.purchase} compras atribuidas.
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--bg-surface)", padding: 18 }}>
      <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{label}</span>
      <strong style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 34, marginTop: 12 }}>{value}</strong>
    </div>
  );
}
```

- [ ] **Step 11: Add placeholder product pages**

Create `apps/web/src/app/(app)/leads/page.tsx`:

```tsx
export default function LeadsPage() {
  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Leads</h1>
      <p>Busca por nome/telefone, filtros por campanha, etiquetas e eventos enviados.</p>
    </section>
  );
}
```

Create `apps/web/src/app/(app)/reports/page.tsx`:

```tsx
import { mockReportOverview } from "../../../mock/reporting";

export default function ReportsPage() {
  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Relatorios</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-surface)" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 12 }}>Campanha</th>
            <th style={{ textAlign: "right", padding: 12 }}>Conversa real</th>
            <th style={{ textAlign: "right", padding: 12 }}>LeadSubmitted</th>
            <th style={{ textAlign: "right", padding: 12 }}>Purchase</th>
            <th style={{ textAlign: "right", padding: 12 }}>ROAS</th>
          </tr>
        </thead>
        <tbody>
          {mockReportOverview.campaigns.map((row) => (
            <tr key={row.id}>
              <td style={{ borderTop: "1px solid var(--border)", padding: 12 }}>{row.name}</td>
              <td style={{ borderTop: "1px solid var(--border)", padding: 12, textAlign: "right" }}>{row.realConversations}</td>
              <td style={{ borderTop: "1px solid var(--border)", padding: 12, textAlign: "right" }}>{row.leadSubmitted}</td>
              <td style={{ borderTop: "1px solid var(--border)", padding: 12, textAlign: "right" }}>{row.purchase}</td>
              <td style={{ borderTop: "1px solid var(--border)", padding: 12, textAlign: "right" }}>{row.roas}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Create `apps/web/src/app/(app)/integrations/page.tsx`:

```tsx
export default function IntegrationsPage() {
  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Integracoes</h1>
      <p>Uazapi primeiro, Meta OAuth desde o inicio e Cloud API preparada para futuro.</p>
    </section>
  );
}
```

Create `apps/web/src/app/(app)/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Configuracoes</h1>
      <p>Workspace, membros, regras de palavra-chave, regras de etiqueta e mapeamento de eventos.</p>
    </section>
  );
}
```

- [ ] **Step 12: Add backoffice placeholder**

Create `apps/web/src/app/(backoffice)/backoffice/page.tsx`:

```tsx
export default function BackofficePage() {
  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Backoffice WppTrack</h1>
      <p>Financeiro, split, workspaces e Central de Diagnostico operacional.</p>
    </section>
  );
}
```

- [ ] **Step 13: Run web typecheck**

Run:

```bash
pnpm install
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Expected: TypeScript passes and Next.js builds.

- [ ] **Step 14: Commit web shell**

```bash
git add apps/web
git commit -m "feat: add navigable Next.js product shell"
```

## Task 5: Add Prisma Schema and Local Data Foundation

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/common/prisma/prisma.service.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add Prisma dependencies**

Run:

```bash
pnpm --filter @wpptrack/api add @prisma/client
pnpm --filter @wpptrack/api add -D prisma
```

Expected: dependencies added to `apps/api/package.json`.

- [ ] **Step 2: Create Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum WorkspaceRole {
  owner
  admin
  member
}

enum WhatsappInstanceStatus {
  pending_payment
  active
  disconnected
  suspended
  error
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships WorkspaceMember[]
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members            WorkspaceMember[]
  whatsappInstances WhatsappInstance[]
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole
  createdAt   DateTime      @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@unique([workspaceId, userId])
}

model WhatsappInstance {
  id          String                 @id @default(cuid())
  workspaceId String
  name        String
  provider    String
  status      WhatsappInstanceStatus @default(pending_payment)
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
```

- [ ] **Step 3: Add Prisma service**

Create `apps/api/src/common/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Register Prisma service**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma/prisma.service";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  controllers: [HealthController, MockController],
  providers: [MockService, PrismaService]
})
export class AppModule {}
```

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
docker compose up -d postgres redis
pnpm --filter @wpptrack/api exec prisma generate --schema prisma/schema.prisma
pnpm --filter @wpptrack/api exec prisma migrate dev --schema prisma/schema.prisma --name init
```

Expected: Prisma client generated and initial migration created.

- [ ] **Step 6: Run API test after Prisma registration**

Run:

```bash
pnpm --filter @wpptrack/api test
```

Expected: health test still passes.

- [ ] **Step 7: Commit data foundation**

```bash
git add apps/api/prisma apps/api/src/common/prisma apps/api/src/app.module.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add Prisma data foundation"
```

## Task 6: Add BullMQ Worker Foundation

**Files:**
- Create: `apps/api/src/common/queue/queue.constants.ts`
- Create: `apps/api/src/common/queue/queue.module.ts`
- Create: `apps/api/src/common/queue/diagnostic.processor.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/queue-contract.test.ts`

- [ ] **Step 1: Add queue dependencies**

Run:

```bash
pnpm --filter @wpptrack/api add @nestjs/bullmq bullmq ioredis
```

Expected: dependencies added.

- [ ] **Step 2: Create queue constants**

Create `apps/api/src/common/queue/queue.constants.ts`:

```ts
export const DIAGNOSTIC_QUEUE = "diagnostic-events";

export interface DiagnosticJobPayload {
  workspaceId: string;
  source: "meta" | "uazapi" | "asaas" | "internal";
  message: string;
  occurredAt: string;
}
```

- [ ] **Step 3: Create diagnostic processor**

Create `apps/api/src/common/queue/diagnostic.processor.ts`:

```ts
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { DIAGNOSTIC_QUEUE, type DiagnosticJobPayload } from "./queue.constants";

@Processor(DIAGNOSTIC_QUEUE)
export class DiagnosticProcessor extends WorkerHost {
  async process(job: Job<DiagnosticJobPayload>) {
    return {
      stored: true,
      workspaceId: job.data.workspaceId,
      source: job.data.source
    };
  }
}
```

- [ ] **Step 4: Create queue module**

Create `apps/api/src/common/queue/queue.module.ts`:

```ts
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DIAGNOSTIC_QUEUE } from "./queue.constants";
import { DiagnosticProcessor } from "./diagnostic.processor";

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379"
      }
    }),
    BullModule.registerQueue({
      name: DIAGNOSTIC_QUEUE
    })
  ],
  providers: [DiagnosticProcessor],
  exports: [BullModule]
})
export class QueueModule {}
```

- [ ] **Step 5: Register queue module**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma/prisma.service";
import { QueueModule } from "./common/queue/queue.module";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  imports: [QueueModule],
  controllers: [HealthController, MockController],
  providers: [MockService, PrismaService]
})
export class AppModule {}
```

- [ ] **Step 6: Add queue contract test**

Create `apps/api/test/queue-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_QUEUE, type DiagnosticJobPayload } from "../src/common/queue/queue.constants";

describe("diagnostic queue contract", () => {
  it("uses the approved queue name and payload", () => {
    const payload: DiagnosticJobPayload = {
      workspaceId: "workspace_demo",
      source: "meta",
      message: "Pixel recusou parametro currency",
      occurredAt: "2026-07-01T12:00:00.000Z"
    };

    expect(DIAGNOSTIC_QUEUE).toBe("diagnostic-events");
    expect(payload.source).toBe("meta");
  });
});
```

- [ ] **Step 7: Run queue tests**

Run:

```bash
pnpm --filter @wpptrack/api test
```

Expected: all API tests pass.

- [ ] **Step 8: Commit queue foundation**

```bash
git add apps/api/src/common/queue apps/api/src/app.module.ts apps/api/test/queue-contract.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add BullMQ diagnostic queue foundation"
```

## Task 7: Add Smoke Tests for Navigation Requirements

**Files:**
- Create: `apps/web/tests/navigation.test.ts`
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Create web Vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 2: Create navigation test**

Create `apps/web/tests/navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clientNavigation, backofficeNavigation } from "@wpptrack/shared";

describe("navigation", () => {
  it("keeps the client panel focused on final customer operations", () => {
    expect(clientNavigation.map((item) => item.id)).toEqual([
      "overview",
      "leads",
      "reports",
      "integrations",
      "settings"
    ]);
    expect(clientNavigation.map((item) => item.label)).not.toContain("Clientes");
  });

  it("keeps internal backoffice separate", () => {
    expect(backofficeNavigation.map((item) => item.id)).toEqual([
      "workspaces",
      "billing",
      "split",
      "diagnostics"
    ]);
  });
});
```

- [ ] **Step 3: Run web tests**

Run:

```bash
pnpm --filter @wpptrack/web test
```

Expected: navigation tests pass.

- [ ] **Step 4: Commit navigation tests**

```bash
git add apps/web/tests apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test: lock WppTrack navigation requirements"
```

## Task 8: Add README and Project Handoff Updates

**Files:**
- Create: `README.md`
- Modify: `Projeto.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```md
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
docker compose up -d postgres redis
pnpm dev
```

## Project Memory

Read `Projeto.md` before changing product direction, architecture or implementation order.
```

- [ ] **Step 2: Update Projeto status**

Modify the `## Estado Atual` section in `Projeto.md` so it includes:

```md
- Plano de implementacao da Fase 1: `docs/superpowers/plans/2026-07-01-wpptrack-foundation-shell-implementation.md`.
- A Fase 1 cria monorepo, app web navegavel, API NestJS, contratos compartilhados, Prisma e BullMQ sem integrar provedores reais ainda.
```

- [ ] **Step 3: Commit docs**

```bash
git add README.md Projeto.md docs/superpowers/plans/2026-07-01-wpptrack-foundation-shell-implementation.md
git commit -m "docs: add foundation implementation plan"
```

## Task 9: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm install
```

Expected: install completes without errors.

- [ ] **Step 2: Run all tests**

Run:

```bash
pnpm test
```

Expected: shared, API and web tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: all packages pass TypeScript checks.

- [ ] **Step 4: Build all packages**

Run:

```bash
pnpm build
```

Expected: shared package builds, API builds, web app builds.

- [ ] **Step 5: Run local services**

Run:

```bash
docker compose up -d postgres redis
pnpm dev
```

Expected:

- API available at `http://localhost:3333/health`.
- Web available at `http://localhost:3000/overview`.
- Reports available at `http://localhost:3000/reports`.
- Backoffice placeholder available at `http://localhost:3000/backoffice`.

- [ ] **Step 6: Commit verification fixes only if needed**

If verification required fixes, commit them:

```bash
git add .
git commit -m "fix: stabilize foundation shell verification"
```

Expected: no commit needed if all previous tasks were correct.

## Self-Review

Spec coverage:

- Product orientation without `Clientes`: covered by shared navigation and web shell.
- Relatorios as core: covered by shared reporting contracts and reports route.
- Uazapi/Meta/Asaas real integrations: not implemented in this foundation plan; intentionally deferred to follow-up plans.
- Auth/workspace permissions: role contracts are defined; real auth deferred to follow-up plan.
- Backoffice B+ and diagnostics: placeholder route and diagnostic queue foundation included; real UI/actions deferred.
- Payment-before-activation: status contracts and Prisma instance status included; real Asaas flow deferred.

Placeholder scan:

- No implementation step uses placeholder markers or vague deferred implementation language.
- Deferred items are explicitly scoped as follow-up plans, not hidden inside this plan.

Type consistency:

- `WorkspaceRole`, `CampaignReportRowDto`, `ReportOverviewDto`, and navigation ids are defined in `@wpptrack/shared` and reused by API/web.
- WhatsApp instance status uses `pending_payment` consistently.
