# WppTrack Overview Business Health Adjustment

## Goal

Make the first viewport answer the client's main business questions without
duplicating information lower on the page.

## Approved Structure

1. Keep the period and Meta account controls at the top.
2. Show five primary metrics in business-reading order:
   investment, Meta conversations, real conversations, traffic revenue and
   purchases.
3. Keep the integrated funnel immediately below the metrics.
4. Show conversion rate and contextual unit cost inside every funnel stage.
5. Keep the daily Meta versus real WhatsApp comparison after the funnel.
6. Remove the workspace summary and tracking-quality blocks.

## Funnel Cost Labels

- Meta conversations: cost per Meta conversation.
- Real conversations: cost per lead.
- Qualified lead: cost per qualified lead.
- Purchase: cost per purchase.
- First purchase: cost per first purchase.
- Repurchase: cost per repurchase.
- Custom stages: cost per stage.

The existing `costCents` field is the source of truth. No API, database or
shared-contract change is required.

## Responsive Behavior

- Wide desktop: five equal metric columns.
- Medium desktop and tablet: metrics wrap into balanced columns.
- Mobile: one metric per row and the existing vertical funnel presentation.
- Funnel cost labels may wrap, but values and neighboring stages must never
  overlap.

## Sidebar Scrollbar

The expanded desktop sidebar uses a compact navigation density: `14px` labels,
`36px` rows, shorter group gaps, and a reduced workspace selector. This keeps
all primary destinations and account actions visible on common notebook
heights.

The scrollbar gutter is not reserved permanently. A thin, low-contrast mint
scrollbar with a transparent track remains available only as an accessibility
fallback for very short viewports or increased browser zoom.

## Safety

- Preserve all report filters and unavailable-data states.
- Do not change report calculations or Meta synchronization.
- The pre-refactor layout remains recoverable through the existing
  `layout-baseline-2026-07-18` Git tag.

## Visual Evidence

Desktop, medium-width, mobile, and sidebar Playwright captures were reviewed
locally and intentionally not versioned because dashboard views can contain
workspace metrics and client-identifying data.

The checked viewports have no page-level horizontal overflow, cost labels stay
inside their funnel stages, and the sidebar keeps a transparent scrollbar
track.
