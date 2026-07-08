**StatCard** — the signature metric tile. Mono uppercase label, big tabular value, delta chip (green up / red down).

```jsx
<StatCard label="Leads no WhatsApp" value="1.284" delta="+18%" hint="vs. 7 dias" />
<StatCard label="Conversões enviadas" value="492" delta="+9%" accent />
```

`accent` makes a filled-brand hero tile. Delta direction is inferred from the sign unless `deltaDir` is passed. Always feed tabular numbers (pt-BR formatting).
