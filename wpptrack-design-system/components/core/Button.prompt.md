**Button** — the primary action control. Use `primary` for the main CTA, `signal` (mint) specifically for *enviar conversão / evento* actions, `secondary`/`ghost` for lower emphasis, `danger` for destructive.

```jsx
<Button variant="primary" iconLeft="send">Enviar conversão</Button>
<Button variant="secondary" size="sm" iconLeft="filter">Filtrar</Button>
<Button variant="ghost">Cancelar</Button>
```

Variants: `primary · signal · secondary · ghost · danger`. Sizes: `sm · md · lg`. Props: `iconLeft`/`iconRight` (Lucide names), `fullWidth`, `disabled`. Hover darkens one brand step; primary gains a teal glow. Press nudges 1px down.
