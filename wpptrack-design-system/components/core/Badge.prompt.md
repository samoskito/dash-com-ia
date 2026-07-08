**Badge** — compact status pill for integration status, event state, lead quality.

```jsx
<Badge tone="signal" dot>Conversão enviada</Badge>
<Badge tone="success" dot>Meta conectado</Badge>
<Badge tone="warning">Pendente</Badge>
```

Tones: `neutral · brand · signal · success · warning · danger · info`. `dot` adds a status dot; `solid` fills it. Use `signal` for events/conversions sent to the Pixel.
