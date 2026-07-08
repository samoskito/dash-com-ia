**Card** — the base surface panel. White, hairline border, `--radius-lg`, soft shadow.

```jsx
<Card eyebrow="Origem do lead" title="Top campanhas" action={<Button variant="ghost" size="sm">Ver tudo</Button>}>
  …
</Card>
```

Props: `eyebrow`, `title`, `action`, `footer`, `padding` (`none|sm|md|lg`), `interactive` (hover lift for clickable cards). Never apply a colored left border — not part of this system.
