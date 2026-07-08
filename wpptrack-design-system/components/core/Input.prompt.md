**Input** — labelled text field with focus ring and hint/error states.

```jsx
<Input label="Nome da campanha" placeholder="black-friday" hint="Usado no rastreamento" />
<Input label="Domínio" prefix="https://" error="Domínio inválido" />
```

Props: `label`, `hint`, `error` (red border, replaces hint), `iconLeft`, `prefix` (mono), `size`. Focus shows the teal ring (`--shadow-focus`).
