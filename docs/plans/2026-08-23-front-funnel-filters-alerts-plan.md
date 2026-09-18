# Plano — funil, filtros de eventos e alertas falsos (2026-08-23)

Origem: `.claude-task-front-funnel-filters.md`. Gate2 aprovado por Samuel.
Escopo deste run: **A + C** implementados; **B + D** ficam documentados aqui.

Contexto de producao: `main ~64943df`, API `wpptrack-api.rastrack.app`,
web `wpp.rastrack.app`, workspace Caxias `cmsr3shnbpytjqo2espqmqriz`.

---

## TASK A — Ordem do funil (Visao Geral + Relatorios)

### Sintoma
Em Caxias o funil renderiza `Conversas reais -> Lead qualificado -> Compras ->
Checkout iniciado`. `InitiateCheckout` aparece **depois** de `Purchase`.

### Causa raiz
`apps/api/src/conversion-rules/funnel-configuration.service.ts`.

`getConfiguration` monta a lista de eventos assim:

```ts
const defaultFunnelEvents = ["LeadSubmitted", "QualifiedLead", "Purchase"];
const eventNames = Array.from(new Set([
  ...defaultFunnelEvents,
  ...persistedStages.map(s => s.eventName),
  ...activeRules.map(r => r.eventName),   // ordenado por createdAt
]));
const defaultPosition = new Map(eventNames.map((e, i) => [e, i + 1]));
```

A posicao default e o **indice de insercao**, nao a ordem canonica do funil.
Caxias nao tem `FunnelStageConfiguration` persistida, entao a regra ativa de
`InitiateCheckout` (criada depois) entra no fim da lista -> posicao 4, depois de
`Purchase`.

Isso vaza para os dois lugares porque ambos consomem a mesma fonte:

- `ReportingMetricsEngine.funnelSteps` ordena por `stage.position`
  (`apps/api/src/reporting/reporting-metrics.engine.ts:349-351`);
- `MetaReportingService.getFunnelStages` chama
  `FunnelConfigurationService.getConfiguration` (`meta-reporting.service.ts:3711`);
- Visao Geral (`apps/web/src/app/(app)/overview/page.tsx:198`) e Relatorios
  (`apps/web/src/app/(app)/reports/page.tsx:1087`) so reagregam `funnelSteps`
  vindos da API, preservando a ordem recebida.

Ou seja: **um fix no backend corrige overview e reports**. Nada de hardcode no front.

### Causa secundaria (front)
As duas funcoes `aggregateFunnelSteps` (overview e reports) fazem merge de
`funnelSteps` de varias linhas com "primeiro visto ganha, resto vai pro fim":

- overview: acumula `order.push(step.key)` na primeira aparicao;
- reports: `Array.from(steps.values())` (ordem de insercao do `Map`).

O engine emite `first_purchase`/`repurchase` **condicionalmente** (so quando ha
valor > 0, `reporting-metrics.engine.ts:363-388`). Logo linhas diferentes podem
trazer listas de tamanhos diferentes, e uma etapa que so aparece na linha 2
acaba anexada no fim mesmo sem ser a ultima do funil.

### Ordem canonica
Vem de `conversionEventCatalog[*].order`
(`packages/shared/src/schemas/conversion-event-catalog.ts`). Hoje:

```
LeadSubmitted 10 | ViewContent 20 | AddToCart 30 | CartAbandoned 35
InitiateCheckout 40 | QualifiedLead 45 | Purchase 50 | OrderCreated 60 ...
```

O catalogo ja poe `InitiateCheckout` antes de `Purchase`, mas poe **checkout
antes de qualificacao**. A sequencia canonica pedida no briefing e
`LeadSubmitted -> QualifiedLead -> InitiateCheckout -> Purchase -> OrderCreated...`
(qualificar precede o envio do link de pagamento).

### Passos
1. `packages/shared/src/schemas/conversion-event-catalog.ts`
   - trocar `QualifiedLead.order` 45 -> 40 e `InitiateCheckout.order` 40 -> 45.
   - exportar `conversionEventCatalogOrder(eventName: string): number`, com
     fallback para eventos fora do catalogo (nunca lanca com dado sujo do banco).
2. `apps/api/src/conversion-rules/funnel-configuration.service.ts`
   - posicao default deixa de ser o indice de insercao e passa a ser derivada da
     ordem do catalogo, **ancorada nas etapas persistidas**: um evento novo entra
     logo depois da ultima etapa persistida cuja ordem de catalogo e menor
     (posicao `ancora + 0.5`), e a renormalizacao final (`index + 1`) ja existente
     converte para inteiros.
   - desempate: ordem do catalogo, depois label.
   - efeito: config manual do cliente continua mandando; eventos novos entram no
     lugar certo em vez de irem pro fim.
3. `apps/web/src/app/(app)/overview/page.tsx` e
   `apps/web/src/app/(app)/reports/page.tsx`
   - `aggregateFunnelSteps`: trocar "append no fim" por merge estavel — cada
     chave nova e inserida logo apos a chave anterior **da propria linha**, nao no
     fim da lista. Sem catalogo hardcoded no front.
4. Testes
   - `apps/api/test/funnel-configuration-service.test.ts`: caso Caxias (regra
     ativa `InitiateCheckout` + defaults) -> IC antes de Purchase; caso com
     posicoes persistidas customizadas -> respeitadas.
   - `packages/shared/tests/conversion-event-catalog.test.ts`: ordem canonica
     QL < IC < Purchase.
   - `apps/web/tests/overview-route.test.ts` / `reports-route.test.ts`: linhas com
     `funnelSteps` de tamanhos diferentes preservam a ordem do funil.

### Verificacao em Caxias
Visao Geral e Relatorios (aba "Visao geral" e tabelas de performance) devem
mostrar `Conversas reais iniciadas -> Lead qualificado -> Checkout iniciado ->
Compras` (+ `Primeira compra` / `Recompra` logo depois de Compras).

---

## TASK C — Filtro "Evento" em Eventos Meta

### Sintoma
`apps/web/src/app/(app)/events/page.tsx:482-486` tem tres `<option>` fixas:
`LeadSubmitted`, `QualifiedLead`, `Purchase`. `InitiateCheckout` — configurado e
enviado em Caxias — nao aparece, entao nao da para filtrar por ele.

### Fonte da verdade
A mesma do funil: `FunnelConfigurationService.getConfiguration(workspaceId)`,
que ja une defaults + etapas persistidas + eventos de regras **ativas** do
workspace (`ProviderConversionRuleConfig` sempre aponta para uma `ConversionRule`
com `eventName`, entao regras do builder tambem entram).

`getConversionAuditOverview` (`meta-reporting.service.ts:1751-1788`) **ja carrega**
`funnelStages` para montar os labels dos eventos. Nao precisa de endpoint novo
nem de query extra — e ja escopado por `input.workspaceId`.

### Passos
1. `packages/shared/src/schemas/reporting.ts`
   - `conversionAuditEventOptionSchema = { eventName, label }`;
   - `conversionAuditOverviewSchema.availableEvents` — **opcional**, para o web
     nao quebrar durante a janela em que a API ainda nao subiu.
2. `apps/api/src/reporting/meta-reporting.service.ts`
   - devolver `availableEvents: funnelStages.map(s => ({ eventName, label }))`
     na resposta da auditoria (ordem = ordem do funil, ja corrigida pela Task A).
3. `apps/web/src/app/(app)/events/page.tsx`
   - opcoes derivadas de `report.availableEvents`;
   - degradacao honesta (sem inventar evento): se a API nao mandar a lista, usar
     os eventos realmente presentes na pagina (`report.events[*].eventName` +
     `eventLabel`);
   - o evento selecionado sempre permanece como opcao, senao o filtro se
     "auto-limpa" ao trocar de periodo.
4. Testes
   - `apps/web/tests/events-route.test.ts`: `availableEvents` com
     `InitiateCheckout` renderiza a option; fallback sem `availableEvents` usa os
     eventos da pagina; evento selecionado fora da lista continua visivel.
   - `apps/api/test/meta-reporting-service.test.ts`: auditoria devolve
     `availableEvents` do funil do workspace.

### Multi-tenant
Nenhum endpoint novo. `funnelStages` ja vem de
`getFunnelStages(input.workspaceId)`; a auditoria inteira e filtrada por
`workspaceId`. Sem vazamento entre workspaces.

### Verificacao em Caxias
Eventos Meta -> Filtros -> "Evento" deve listar `Conversas reais iniciadas`,
`Lead qualificado`, `Checkout iniciado`, `Compras`. Selecionar
`Checkout iniciado` filtra a lista.

### Follow-up conhecido (fora deste PR)
Os mesmos `<option>` fixos existem em:
- `apps/web/src/app/(app)/leads/page.tsx:325-329` (filtro "Etapa do funil") — a
  resposta de `/leads` ainda nao carrega a lista de eventos do workspace; precisa
  do mesmo tratamento na API de leads;
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/conversions/page.tsx:434-435`
  — tela de backoffice, cross-workspace; exige decisao sobre escopo antes de
  virar dinamica.

Nao entram aqui para manter o diff pequeno e focado.

---

## TASK B — Layout do header/filtros de Relatorios (print pendente)

Samuel vai mandar o print. **Nenhuma mudanca estrutural neste PR** — nada aqui e
"trivialmente seguro" sem ver o print. Observacoes concretas levantadas na
leitura de `apps/web/src/app/(app)/reports/meta-report-filters.tsx` +
`apps/web/src/styles/layout-system.css:1622-1738`:

1. **Grid de 5 colunas com 6 filhos.** `.report-filter-primary` declara
   `grid-template-columns` com 5 trilhas (css:1629-1634), mas o form tem 6 filhos
   (BM, conta, busca, botao Aplicar, `<details>` Avancados). O `<details>` cai
   numa **coluna implicita**. Quando aberto, `grid-column: 1 / -1` (css:1695)
   refere-se as linhas do grid **explicito**, ou seja nao cobre a coluna
   implicita onde ele mesmo esta — principal suspeito do "bagunçado".
2. **Botao "Avancados" pula de lugar ao abrir.** Fechado, ele fica na coluna
   implicita; aberto, ganha `width: fit-content; margin: 10px 0 0 auto`
   (css:1700-1705) e vai pra direita. Deslocamento horizontal a cada toggle.
3. **Sem breakpoint responsivo.** As 5 trilhas sao fixas; os minimos
   (120+140+150 + dois `auto`) mais os gaps estouram a largura util em telas
   estreitas/zoom alto. `.report-filter-primary` nunca vira 1 coluna.
4. **Grid avancado 3x com 7 campos** (css:1709): a ultima linha fica com 1 campo
   orfao ("Itens por pagina") e dois buracos.
5. **Modo apresentacao muda a altura da linha.** Os dois `<select>` viram
   `<span class="presentation-filter-placeholder">` (filters.tsx:218-222,
   240-244); se o span nao tiver a mesma altura do select, a primeira linha do
   grid encolhe e desalinha o botao Aplicar.
6. **Rodape sem estado vazio.** `.report-filter-footer` e
   `justify-content: space-between` (css:1730) com apenas 1 filho quando nao ha
   filtros — o texto encosta na esquerda enquanto o `<summary>` esta na direita.

Quando o print chegar: confirmar qual desses e o que Samuel esta vendo antes de
mexer. Fix minimo provavel = declarar a 6a trilha (ou mover o `<details>` pra
fora do grid) + breakpoint.

---

## TASK D — Alertas falsos de desconexao (Caxias) — PR separado

Cliente recebeu 3 alertas de desconexao com a instancia CONECTADA; Samuel
desligou os alertas.

### Onde esta
`apps/api/src/ops-alerts/ops-alerts.service.ts:117-124`:

```ts
const status = await this.whatsappConnections.getStatus(workspaceId, instance.id);
if (status.connectionStatus === "disconnected") {
  await this.notify(... "WhatsApp desconectado" ...);
}
```

### Hipoteses de causa raiz (investigar nesta ordem)
1. **Leitura unica, sem confirmacao.** Um unico `getStatus` decide o alerta. Um
   blip da UAZAPI (timeout, 5xx mapeado, `connecting`/`qr` caindo em
   `disconnected`) ja dispara. Precisa de N leituras consecutivas.
2. **Mapeamento do status do provedor.** Conferir em
   `apps/api/src/integrations/whatsapp-connections.service.ts` o que vira
   `disconnected`. Se estados transitorios (`connecting`, `qrcode`, `syncing`)
   colapsam para `disconnected`, o alerta e falso por construcao.
3. **Debounce por chave.** `notify` ja tem debounce por `alertKey`
   (`disconnect:<instanceId>`, `debounceHours`, linhas 151-161). 3 alertas no
   mesmo dia sugerem `debounceHours` baixo **ou** `alertKey` variando — validar
   qual dos dois.
4. **Erro tratado como silencio, nao como desconexao.** O `catch` (linha 122) so
   loga — ok — mas confirmar que nao ha outro caminho (webhook
   `connection.update` / `logout`) emitindo o mesmo alerta.

### Plano
- Confirmacao de estado: so alertar apos K leituras consecutivas `disconnected`
  (persistir contador/`disconnectedSince` por instancia), com o estado zerando em
  qualquer leitura conectada.
- Mensagem de reconexao ("WhatsApp reconectado") quando o estado volta, para o
  cliente nao ficar sem fechamento do incidente.
- Rever `debounceHours` default e garantir `alertKey` estavel.
- Testes cobrindo: blip unico nao alerta; K consecutivas alertam; reconexao
  limpa o contador e avisa; alerta desligado continua respeitado.
- **Nao remover a feature de alerta.** Fail-closed continua.

---

## Restricoes deste run
- Sem merge sem `autorizado merge` do Samuel.
- Sem reenvio de WhatsApp.
- Sem zeros falsos / KPI inventado: `availableEvents` ausente cai em dados reais
  da pagina, nunca em lista fabricada.
- Diffs pequenos e focados; nada de refactor de UI nao relacionada.
