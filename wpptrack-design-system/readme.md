# WppTrack — Design System

> Rastreamento de cliques e leads do WhatsApp para campanhas Meta Ads.
> Tenha sua própria estrutura de dados: descubra qual campanha, conjunto e anúncio gerou cada lead e envie conversões para o Pixel da Meta.

This is the **first visual identity** for **WppTrack**, a SaaS structure for *gestores de tráfego* and agencies running high-volume WhatsApp lead campaigns. The brand must feel **professional, trustworthy, technical-but-clear, and performance-oriented** — B2B SaaS for tracking, data, and Meta Ads — *without* copying WhatsApp's identity or leaning on its pure green.

**Core idea:** the user stops operating in the dark. Before → loose clicks, conversations and scattered data. With WppTrack → a clear lead journey: **anúncio → clique → WhatsApp → lead → conversão → evento enviado para o Meta Ads.**

## Sources
This identity was created **from scratch** from a written brief (no codebase, no Figma, no prior brand). All visual decisions below originate here — there is no upstream source of truth to defer to. The brief specified: teal/petroleum primary, light + dark dashboard, "lightly technological with character" type, and a bubble-with-tracking-pin symbol direction.

---

## CONTENT FUNDAMENTALS

**Language:** Brazilian Portuguese (pt-BR). The product, UI, marketing and docs are written in Portuguese.

**Voice:** direct, didactic, confident, professional — anchored to the trafficker's *real pain*. Clarity and performance over abstraction. Never hype, never generic startup-speak.

**Person:** speak to the user as **"você"**. Imperative, action-first verbs ("Rastreie", "Descubra", "Envie", "Veja"). The product is the silent enabler; the user is the protagonist taking control.

**Casing:** Sentence case for UI labels and buttons ("Enviar conversão", "Filtrar por campanha"). Title Case avoided. UPPERCASE reserved for tiny mono eyebrows/labels (e.g. `CAMPANHA`, `EVENTOS ENVIADOS`) with wide tracking. The brand name is always **WppTrack** — one word, capital W and T.

**Numbers & data:** always tabular figures. Currency `R$ 1.240,00` (pt-BR format). Percentages with a sign on deltas (`+18%`, `−4%`). IDs, UTMs and tracking codes in **mono** (`utm_campaign=black-friday`, `ad_id 23859…`).

**Emoji:** **not used.** No emoji in UI, marketing or docs. Status is carried by color + icon + label, never by emoji.

**Tone examples (on-brand):**
- "Saiba de onde vêm seus leads do WhatsApp."
- "Descubra qual campanha, conjunto e anúncio gerou cada lead."
- "Pare de operar campanhas para WhatsApp no escuro."
- "Do clique no anúncio à conversa no WhatsApp, tudo rastreado."
- "Menos mensalidade. Mais controle."

**Avoid:** chatbot/automation framing, mass-messaging language, "disparo", CRM-completo claims, excessive AI talk, futuristic/cyberpunk wording, anything that reads as social-media-generic.

---

## VISUAL FOUNDATIONS

**Color.** Primary is a **teal / petroleum green** (`--teal-500 #0E8C7A`) — it signals technology, messaging and trust while staying clearly distinct from WhatsApp's `#25D366`. A bright **signal mint** (`--signal-500 #12B884`, with `--signal-400`) is the accent for *events, conversions and tracking pulses* — used sparingly as the "sinal enviado" cue (it is the mint pixel in the logo). Neutrals are a **cool, faintly teal-tinted graphite** scale (not pure gray) so light surfaces read calm and premium and dark surfaces read like a focused data console. Semantic set: success green, **amber** warning (events/alerts), red danger, blue info. Avoid: pure WhatsApp green as the dominant color, purple/pink, rainbow dashboards.

**Light vs dark.** Both ship. **Light is the default** — off-white app bg (`--gray-50`), pure-white cards, soft cool shadows; premium and clean. **Dark** (`--bg-app #0B1211`) is a graphite data console: near-black bg, slightly elevated surfaces, brand brightens to `--teal-400`, borders are low-contrast hairlines. Toggle with `data-theme="dark"` on a root element.

**Type.** **Space Grotesk** for display/headings (technological character — distinctive a/g/t), **Hanken Grotesk** for body/UI (clean, warm, legible — deliberately *not* Inter), **JetBrains Mono** for data, metrics, IDs, UTMs and the uppercase eyebrows. Display is set tight (`--tracking-tight`/`tighter`); metrics are big and mono-or-display with tabular figures. Eyebrows are tiny mono, uppercase, wide tracking, in brand teal.

**Spacing & layout.** 4px base grid. App shell: `--sidebar-w 248px` + `--topbar-h 60px`, content padding `24px`. Density is SaaS-comfortable, not cramped. Marketing uses a `1200px` max container with generous vertical rhythm.

**Backgrounds.** Mostly flat solid surfaces — **no photography, no heavy gradients**. Permitted texture is restrained and *meaningful*: a subtle dot-grid or faint "tracking route" line motif (connected nodes) for hero/empty states, and a single soft teal→deep-teal gradient on the logo tile and occasional brand panels. No full-bleed imagery, no noise/grain.

**Motion.** Quick and confident, **no bounce**. `--dur-fast 120ms` / `--dur-base 180ms` with `--ease-out`. Fades + small (2–6px) translases; the only looping animation allowed is a gentle **signal pulse** on a live tracking dot. Respect `prefers-reduced-motion`.

**Hover / press.** Buttons darken one brand step on hover (`--brand → --brand-hover`); ghost/secondary fill with `--bg-hover`. Press = `--brand-active` + a 1px nudge or `scale(0.98)`, never a big squash. Cards lift slightly (`--shadow-sm → --shadow-md`) and the border strengthens on hover when interactive.

**Borders.** Hairline `1px var(--border)` everywhere; `1.5px` for emphasis. Borders do real work in this system (they separate dense data) — every card and input has one. **No** colored-left-border accent cards (an AI trope to avoid).

**Shadows.** Soft, cool, low-spread — `--shadow-sm` for resting cards, `--shadow-md` for popovers/menus, `--shadow-lg` for dialogs, `--shadow-brand` (teal glow) only on the primary CTA. Dark theme uses deeper black shadows.

**Radii.** `--radius-md 10px` is the workhorse (cards, inputs, buttons). Pills (`--radius-pill`) for tags/badges/status chips. The logo tile uses a larger `16/64` superellipse-style corner. Nothing fully sharp; nothing cartoonishly round.

**Cards.** White (light) / `--bg-surface` (dark), `1px var(--border)`, `--radius-lg (14px)`, `--shadow-sm`. Metric cards lead with a tiny mono eyebrow label, then a large tabular number, then a delta chip (green up / red down) — clean and scannable.

**Transparency & blur.** Used sparingly: subtle `--brand-subtle` tints for selected/active rows and chips, and an optional backdrop blur on sticky topbars and dialog scrims. Imagery, when present, stays cool-toned — but this brand is fundamentally **iconographic and data-driven, not photographic**.

---

## ICONOGRAPHY

**System: [Lucide](https://lucide.dev)** — linked from CDN. Rationale: Lucide's clean 2px-stroke, rounded-join geometry matches the brand's "technical-but-friendly" personality and pairs naturally with Space/Hanken Grotesk. Use it consistently; do not mix icon sets.

- **Stroke width:** 2px (1.75px acceptable in dense tables). Size 16/18/20px in UI, 24px+ in marketing.
- **Color:** inherit `currentColor` — `--text-secondary` at rest, `--brand` when active/selected, semantic colors for status.
- **Common glyphs** for this product: `radar` / `crosshair` / `locate` (tracking), `message-circle` / `message-square` (WhatsApp/conversa), `mouse-pointer-click` (clique), `git-branch` / `share-2` (campanha→conjunto→anúncio), `send` / `zap` (evento/conversão enviado), `trending-up` / `bar-chart-3` (performance), `filter`, `users`, `database`.
- **Brand symbol** is *not* a Lucide icon — it's the custom WppTrack mark (see `assets/`). Never substitute the mark with a generic chat icon.
- **Emoji / unicode as icons:** never. **Hand-drawn one-off SVGs:** avoid — use Lucide or the brand mark.

CDN: `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`, or use `https://unpkg.com/lucide-static/icons/<name>.svg`.

---

## Brand assets (`assets/`)
The identity is **wordmark-led** — there is no pictorial symbol. The brand shows up as the **WppTrack** wordmark in long form, and as a compact **"WT"** monogram tile where space is tight (favicon, avatar, sidebar-collapsed).
- `logo-mark.svg` / `logo-horizontal.svg` — the **WppTrack wordmark** (text only), for light backgrounds.
- `logo-horizontal-light.svg` — wordmark for dark backgrounds.
- `logo-avatar.svg` — **"WT" monogram**, white on a teal-gradient rounded tile — favicon / social avatar / app icon.

> The **wordmark** sets "WppTrack" in Space Grotesk Bold, `letter-spacing −0.5`, two-tone: **Wpp** in `--brand`, **Track** in `--text-primary` (mint + off-white on dark). The **WT** monogram uses the same face, Bold, white on `--teal-500 → --teal-700` gradient.

---

## Index / manifest
- **`styles.css`** — root entry; `@import`s every token + base file. Consumers link only this.
- **`tokens/`** — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`, `base.css`.
- **`assets/`** — brand marks & lockups (above).
- **`components/core/`** — reusable React primitives: `Button`, `Badge`, `StatCard`, `Card`, `Tag`, `Input`. (See each `.prompt.md`.)
- **`ui_kits/dashboard/`** — WppTrack tracking dashboard recreation (`index.html` + screen JSX).
- **Foundation cards** (`*.card.html`) — specimen tiles rendered in the Design System tab (Colors, Type, Spacing, Brand).
- **`SKILL.md`** — Agent-Skill manifest for downloadable use.

## CAVEATS
- Fonts load from **Google Fonts CDN** (not bundled binaries). Self-host `.woff2` before production/offline use.
- Icons use **Lucide via CDN** (substitute for a brand-owned set — flag if you want a custom icon library).
- Several pictorial directions were explored (pin, radar, crosshair, node trail, branch-to-target) and set aside — the brand is intentionally **wordmark-led** with a **"WT"** monogram tile for compact use. No standalone symbol ships.
