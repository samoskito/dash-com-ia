---
name: wpptrack-design
description: Use this skill to generate well-branded interfaces and assets for WppTrack, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's here
- `readme.md` — full design guide: brand context, content fundamentals, visual foundations, iconography, asset & file index. **Start here.**
- `styles.css` — the single CSS entry point; `@import`s all tokens + fonts + base. Link this one file.
- `tokens/` — color, typography, spacing, effects, fonts, base CSS (custom properties; light + `[data-theme="dark"]`).
- `assets/` — brand marks & lockups (SVG): `logo-mark.svg` (primary symbol), `logo-avatar.svg`, `logo-horizontal[-light].svg`, plus alt directions `logo-mark-b/c.svg`.
- `components/core/` — React primitives: `Button`, `Badge`, `Tag`, `Card`, `StatCard`, `Input` (each with `.d.ts` + `.prompt.md`).
- `ui_kits/dashboard/` — the WppTrack tracking dashboard recreation (light + dark).
- `guidelines/*.card.html` — foundation specimen tiles.

## Brand in one breath
WppTrack = WhatsApp lead tracking for Meta Ads traffickers/agencies. Teal/petroleum primary (`--teal-500 #0E8C7A`, NOT WhatsApp green) + mint "signal" accent for events/conversions + cool graphite neutrals. Type: Space Grotesk (display) / Hanken Grotesk (body) / JetBrains Mono (data). Voice: pt-BR, "você", direct & performance-oriented, no emoji. Clean B2B SaaS — clarity, control, data.
