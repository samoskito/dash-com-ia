# WppTrack Parallel Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:dispatching-parallel-agents for concurrent tracks and superpowers:subagent-driven-development style review gates per track. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance WppTrack beyond the foundation by running independent workstreams in parallel: visual parity, auth/workspaces, integration scaffolds, and diagnostics design.

**Architecture:** Each track owns a disjoint file set. Visual work stays in `apps/web`; auth/workspaces owns Prisma and auth/workspace API files; integrations owns isolated adapter modules without Prisma changes; diagnostics produces documentation only.

**Tech Stack:** Next.js, React, NestJS, Prisma, PostgreSQL schema, BullMQ contracts, Zod, Vitest, TypeScript.

---

## Coordination Rules

- [ ] Only one track may edit `apps/api/prisma/schema.prisma`: Track B.
- [ ] Track C must not edit Prisma.
- [ ] Track D must not edit code.
- [ ] Track A must not edit `apps/api` or `packages/shared`.
- [ ] If a track needs a shared change outside its scope, it must report `NEEDS_CONTEXT` instead of editing.
- [ ] Every implementation track must run its focused tests before commit.
- [ ] After all tracks finish, the controller runs `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## Track A: Visual Parity

**Files:**
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/(app)/overview/page.tsx`
- Modify: `apps/web/src/app/(app)/leads/page.tsx`
- Modify: `apps/web/src/app/(app)/reports/page.tsx`
- Modify: `apps/web/src/app/(app)/integrations/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`
- Modify: `apps/web/src/app/(backoffice)/backoffice/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify if needed: `apps/web/tests/navigation.test.ts`
- Modify if needed: `apps/web/tests/login-route.test.ts`

- [ ] **Step A1: Inspect visual references**

Read:

```bash
Get-Content -Raw design-system/Telemetria-Noturna-Filosofia-de-Design.md
Get-Content -Raw visualizacao-wpptrack.html
Get-Content -Raw wpptrack-saas-visual.html
```

Expected: identify dark telemetry direction, dense dashboard styling, data-first hierarchy, teal/mint signal color, mono data labels, no generic beige shell.

- [ ] **Step A2: Replace provisional tokens**

Update `apps/web/src/styles/globals.css` so root tokens use:

```css
:root {
  --bg: #050807;
  --bg-elevated: #08110f;
  --bg-panel: #0b1613;
  --bg-panel-soft: #101d19;
  --line: rgba(141, 255, 219, 0.12);
  --line-strong: rgba(141, 255, 219, 0.22);
  --signal: #12b884;
  --signal-strong: #0e8c7a;
  --cyan: #38d5ff;
  --blue: #5b7cfa;
  --coral: #ff6b5f;
  --text: #eef7f3;
  --text-soft: #9eb3aa;
  --text-faint: #587068;
  --font-display: "Space Grotesk", "Segoe UI", sans-serif;
  --font-body: "Hanken Grotesk", "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Mono", monospace;
}
```

Preserve responsive behavior.

- [ ] **Step A3: Refactor `AppShell` for Telemetria Noturna**

Update `apps/web/src/components/app-shell.tsx` to render:

- brand block with `WppTrack` and small status text `Telemetria de conversao`.
- top workspace strip inside sidebar.
- nav links from `clientNavigation`.
- footer health strip with `API`, `Meta`, `WhatsApp`, `Pixel` status chips.

Keep routes unchanged.

- [ ] **Step A4: Redesign pages with data-dense panels**

Update product pages to use classes:

- `.page-grid`
- `.telemetry-card`
- `.metric-card`
- `.signal-table`
- `.status-chip`
- `.action-row`

Page content requirements:

- Overview: KPIs, integrated funnel, tracking quality panel.
- Leads: filter bar, lead table, event/status chips.
- Reports: campaign table with Meta conversations, real conversations, LeadSubmitted, QualifiedLead, Purchase, costs.
- Integrations: WhatsApp/Uazapi, Meta OAuth, Pixel health cards.
- Settings: workspace, members, event mapping and Meta API version controls.
- Backoffice: billing/split/workspaces/diagnostics panels.
- Login: dark telemetry login screen with email/password and Google button.

- [ ] **Step A5: Run web verification**

Run:

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Expected: all pass and `/login` remains listed in build output.

- [ ] **Step A6: Commit**

```bash
git add apps/web
git commit -m "feat: align web shell with WppTrack design system"
```

## Track B: Auth + Workspaces

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/password.service.ts`
- Create: `apps/api/src/auth/session.types.ts`
- Create: `apps/api/src/workspaces/workspaces.module.ts`
- Create: `apps/api/src/workspaces/workspaces.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/auth-contract.test.ts`
- Create: `apps/api/test/workspaces-contract.test.ts`
- Create: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/contracts.test.ts`
- Modify if needed: `apps/api/package.json`, `pnpm-lock.yaml`

- [ ] **Step B1: Add dependencies**

Run:

```bash
pnpm --filter @wpptrack/api add bcryptjs
pnpm --filter @wpptrack/api add -D @types/bcryptjs
```

Expected: dependencies installed.

- [ ] **Step B2: Extend Prisma schema**

Add models/enums to `apps/api/prisma/schema.prisma`:

```prisma
enum AuthProvider {
  email
  google
}

enum WorkspaceInviteStatus {
  pending
  accepted
  revoked
  expired
}

model AuthSession {
  id           String   @id @default(cuid())
  userId       String
  refreshHash  String
  userAgent    String?
  ipAddress    String?
  expiresAt    DateTime
  revokedAt    DateTime?
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model WorkspaceInvite {
  id          String                @id @default(cuid())
  workspaceId String
  email       String
  role        WorkspaceRole
  status      WorkspaceInviteStatus @default(pending)
  tokenHash   String
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime              @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId, email])
}
```

Also add relations:

```prisma
// User
sessions AuthSession[]

// Workspace
invites WorkspaceInvite[]
```

And add to `User`:

```prisma
authProvider AuthProvider @default(email)
googleId     String?      @unique
emailVerifiedAt DateTime?
```

- [ ] **Step B3: Add shared auth schemas**

Create `packages/shared/src/schemas/auth.ts`:

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2),
  workspaceName: z.string().min(2)
});

export const googleOAuthStartSchema = z.object({
  redirectTo: z.string().min(1).optional()
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type GoogleOAuthStartDto = z.infer<typeof googleOAuthStartSchema>;
```

Export it from `packages/shared/src/index.ts`.

- [ ] **Step B4: Add password service**

Create `apps/api/src/auth/password.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";

@Injectable()
export class PasswordService {
  private readonly rounds = 12;

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

- [ ] **Step B5: Add auth service/module**

Create `apps/api/src/auth/session.types.ts`:

```ts
import type { WorkspaceRole } from "@wpptrack/shared";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  workspaces: Array<{
    id: string;
    slug: string;
    name: string;
    role: WorkspaceRole;
  }>;
}
```

Create `apps/api/src/auth/auth.service.ts`:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { LoginDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "./session.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService
  ) {}

  async validateEmailLogin(input: LoginDto): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        memberships: {
          include: { workspace: true }
        }
      }
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    const valid = await this.passwords.verify(input.password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        role: membership.role
      }))
    };
  }
}
```

Create `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

@Module({
  providers: [AuthService, PasswordService, PrismaService],
  exports: [AuthService, PasswordService]
})
export class AuthModule {}
```

- [ ] **Step B6: Add workspaces service/module**

Create `apps/api/src/workspaces/workspaces.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { canManageIntegrations, canManageWorkspaceBilling, type WorkspaceRole } from "@wpptrack/shared";

@Injectable()
export class WorkspacesService {
  getPermissions(role: WorkspaceRole) {
    return {
      canManageBilling: canManageWorkspaceBilling(role),
      canManageIntegrations: canManageIntegrations(role),
      canInviteMembers: role === "owner" || role === "admin"
    };
  }
}
```

Create `apps/api/src/workspaces/workspaces.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";

@Module({
  providers: [WorkspacesService],
  exports: [WorkspacesService]
})
export class WorkspacesModule {}
```

Modify `apps/api/src/app.module.ts`:

```ts
imports: [QueueModule, AuthModule, WorkspacesModule]
```

- [ ] **Step B7: Add tests**

Create `apps/api/test/auth-contract.test.ts` with tests for password hash/verify and invalid password.

Create `apps/api/test/workspaces-contract.test.ts` with role permission tests for owner/admin/member.

Update shared contract tests to validate `loginSchema` and `registerSchema`.

- [ ] **Step B8: Run verification**

Run:

```bash
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/api typecheck
pnpm --filter @wpptrack/api exec prisma generate --schema prisma/schema.prisma
$env:DATABASE_URL='postgresql://wpptrack:wpptrack@localhost:5432/wpptrack'; pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
```

Expected: all pass except no migration is required because Docker may be unavailable.

- [ ] **Step B9: Commit**

```bash
git add apps/api packages/shared pnpm-lock.yaml
git commit -m "feat: add auth and workspace foundation"
```

## Track C: Integration Scaffolds

**Files:**
- Create: `packages/shared/src/schemas/integrations.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/contracts.test.ts`
- Create: `apps/api/src/integrations/integration.types.ts`
- Create: `apps/api/src/integrations/integration-error.ts`
- Create: `apps/api/src/integrations/meta/meta.adapter.ts`
- Create: `apps/api/src/integrations/uazapi/uazapi.adapter.ts`
- Create: `apps/api/src/integrations/asaas/asaas.adapter.ts`
- Create: `apps/api/src/integrations/integrations.module.ts`
- Create: `apps/api/test/integrations-contract.test.ts`

- [ ] **Step C1: Add shared integration schemas**

Create `packages/shared/src/schemas/integrations.ts`:

```ts
import { z } from "zod";
import { integrationStatuses } from "../statuses";

export const integrationProviderSchema = z.enum(["meta", "uazapi", "asaas"]);

export const integrationHealthSchema = z.object({
  provider: integrationProviderSchema,
  status: z.enum(integrationStatuses),
  checkedAt: z.string().datetime(),
  message: z.string().optional()
});

export type IntegrationProviderDto = z.infer<typeof integrationProviderSchema>;
export type IntegrationHealthDto = z.infer<typeof integrationHealthSchema>;
```

Export from `packages/shared/src/index.ts`.

- [ ] **Step C2: Add integration base types**

Create `apps/api/src/integrations/integration.types.ts`:

```ts
import type { IntegrationHealthDto, IntegrationProviderDto } from "@wpptrack/shared";

export interface IntegrationAdapter {
  readonly provider: IntegrationProviderDto;
  getHealth(): Promise<IntegrationHealthDto>;
}
```

Create `apps/api/src/integrations/integration-error.ts`:

```ts
export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly causeCode: string
  ) {
    super(message);
  }
}
```

- [ ] **Step C3: Add provider adapters**

Create Meta, Uazapi and Asaas adapter classes implementing `IntegrationAdapter`.

Each adapter returns status `disconnected` when required env vars are missing and `connected` when env vars exist.

Required env vars:

- Meta: `META_APP_ID`, `META_APP_SECRET`
- Uazapi: `UAZAPI_BASE_URL`, `UAZAPI_TOKEN`
- Asaas: `ASAAS_BASE_URL`, `ASAAS_API_KEY`

- [ ] **Step C4: Add integrations module**

Create `apps/api/src/integrations/integrations.module.ts` exporting the three adapters.

Do not import this module in `AppModule` in this track.

- [ ] **Step C5: Add tests**

Create `apps/api/test/integrations-contract.test.ts` that instantiates adapters directly and asserts:

- provider names are `meta`, `uazapi`, `asaas`.
- missing env returns `disconnected`.
- health DTOs pass `integrationHealthSchema`.

Update shared contract test for `integrationHealthSchema`.

- [ ] **Step C6: Run verification**

Run:

```bash
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/api typecheck
```

Expected: all pass.

- [ ] **Step C7: Commit**

```bash
git add apps/api/src/integrations apps/api/test/integrations-contract.test.ts packages/shared
git commit -m "feat: add integration adapter scaffolds"
```

## Track D: Diagnostics and Logs Spec

**Files:**
- Create: `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`
- Modify: `Projeto.md`

- [ ] **Step D1: Write diagnostics spec**

Create a spec with sections:

- Objective.
- Log entities: `WebhookLog`, `IntegrationLog`, `ConversionEventLog`, `JobAttempt`, `DiagnosticEvent`, `AuditLog`.
- Sources: Meta, Uazapi, Asaas, internal jobs.
- Backoffice screens: overview, filters, event detail, retry drawer.
- Retention and privacy rules.
- Safe retry rules.
- What must not be retried automatically.
- Prisma implementation deferred to the next diagnostics plan.

- [ ] **Step D2: Update Projeto.md**

Add one bullet under `Estado Atual`:

```md
- Diagnosticos/logs operacionais possuem spec dedicada em `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`; implementacao Prisma/API fica para fase posterior para evitar conflito com Auth/Workspace.
```

- [ ] **Step D3: Verify docs**

Run:

```bash
git diff --check
rg -n "T[B]D|T[O]DO|IMPLEMENTAR_DEPOIS" docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md Projeto.md
```

Expected: no whitespace errors and no incomplete-work markers.

- [ ] **Step D4: Commit**

```bash
git add docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md Projeto.md
git commit -m "docs: specify diagnostics and logs"
```

## Final Integration Verification

- [ ] **Step 1: Remove generated local artifacts**

Run:

```powershell
if (Test-Path -LiteralPath "apps\web\tsconfig.tsbuildinfo") { Remove-Item -LiteralPath "apps\web\tsconfig.tsbuildinfo" }
if (Test-Path -LiteralPath "apps\api\tsconfig.tsbuildinfo") { Remove-Item -LiteralPath "apps\api\tsconfig.tsbuildinfo" }
```

- [ ] **Step 2: Run root checks**

Run:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

- [ ] **Step 3: Prisma validation**

Run:

```bash
pnpm --filter @wpptrack/api exec prisma generate --schema prisma/schema.prisma
$env:DATABASE_URL='postgresql://wpptrack:wpptrack@localhost:5432/wpptrack'; pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
```

Expected: both pass.

- [ ] **Step 4: Docker limitation check**

Run:

```bash
docker compose up -d postgres redis
```

Expected: pass if Docker Desktop is available; otherwise document the same known Docker Desktop Linux engine limitation.

- [ ] **Step 5: Update Projeto.md**

Update `Projeto.md` with completed tracks, verification, and remaining limitations.

- [ ] **Step 6: Commit final handoff**

```bash
git add Projeto.md
git commit -m "docs: record parallel wave 1 status"
```
