# WppTrack layout baseline

Baseline recorded on 2026-07-18 before the progressive visual refactor.

The first refactor wave and its visual evidence are documented in
`docs/plans/2026-07-18-wpptrack-progressive-visual-refactor-design.md`.

## Immutable reference

- Git tag: `layout-baseline-2026-07-18`
- Commit: `c0c91311e2a430c968d2bde8aa75d2ae5acfcbb2`
- Commit subject: `feat: add Umbler channel readiness`
- Branch at capture time: `main`

The tag points to the complete application state that is currently working in
production. The visual refactor must not change database migrations, inbound
webhook processing, Meta routing, replay controls, authentication, workspace
authorization, or the Barbieri integration.

## Current visual structure

### Application shell

- Fixed desktop sidebar with `260px` expanded and `76px` collapsed widths.
- Mobile drawer is activated at `900px`.
- Brand and workspace selector are at the top.
- Client navigation contains Visao geral, Leads, Relatorios, Eventos Meta,
  Integracoes, and Configuracoes.
- Platform owners receive a separate Backoffice entry.
- Account status, presentation mode, and logout are at the bottom.
- Platform support access displays a context bar above page content.

### Content structure

- Product pages use `.page-stack`.
- The global content maximum is `1180px`.
- Page headers use eyebrow, title, supporting text, and optional actions.
- Operational information is presented through metric cards, surface panels,
  tables, tags, and status chips.
- Backoffice uses a separate sticky horizontal navigation.

### Visual identity

- Dark graphite background with a subtle grid.
- Mint and teal are the primary brand and action colors.
- Cyan, blue, amber, and coral are semantic supporting colors.
- Space Grotesk is used for display text.
- Hanken Grotesk is used for body text.
- JetBrains Mono is used for operational labels and identifiers.
- Surfaces and controls use an `8px` corner radius.

## Layout ownership

The main files that define this baseline are:

- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/backoffice-navigation.tsx`
- `apps/web/src/components/backoffice-operations-navigation.tsx`
- `apps/web/src/components/presentation-mask.tsx`
- `apps/web/src/components/presentation-mode-toggle.tsx`
- `apps/web/src/styles/globals.css`
- `apps/web/src/app/(app)/layout.tsx`
- `packages/shared/src/navigation.ts`

Individual route pages remain responsible for their own information hierarchy
inside the shell.

## Safe comparison

Review only frontend changes introduced after the baseline:

```bash
git diff layout-baseline-2026-07-18..HEAD -- \
  apps/web/src \
  packages/shared/src/navigation.ts
```

Inspect the original version of one file:

```bash
git show layout-baseline-2026-07-18:apps/web/src/components/app-shell.tsx
```

## Safe restoration

Create an isolated recovery branch with the complete baseline:

```bash
git switch -c recovery/layout-2026-07-18 layout-baseline-2026-07-18
```

Restore only the visual shell on the current branch after reviewing the diff:

```bash
git restore \
  --source layout-baseline-2026-07-18 \
  -- apps/web/src/components/app-shell.tsx \
     apps/web/src/components/backoffice-navigation.tsx \
     apps/web/src/components/backoffice-operations-navigation.tsx \
     apps/web/src/styles/globals.css \
     packages/shared/src/navigation.ts
```

Do not use `git reset --hard` for a visual rollback. A selective restore keeps
database, integration, security, and operational work intact.

## Worktree note

At capture time, the following operational documents already had local changes
and were intentionally left untouched:

- `docs/superpowers/plans/2026-07-13-wpptrack-access-email-meta-connections-implementation.md`
- `docs/superpowers/plans/2026-07-18-wpptrack-umbler-replay-canary-implementation.md`

They contain the Umbler observation and Monday replay checkpoint and must not be
discarded during visual work.
