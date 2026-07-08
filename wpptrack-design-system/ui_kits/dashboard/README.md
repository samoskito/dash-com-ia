# WppTrack — Dashboard UI kit (operação de agência)

High-fidelity recreation of the **WppTrack agency console**. An agency manages **multiple clients**; each client has one or more **Meta Pixels** and a stream of WhatsApp leads. Light + dark (toggle in the topbar). Click through the whole flow.

## Screens & flow
- **Visão geral** (`screens/Overview.jsx`) — agency-wide totals across the whole operation. Filter by **client** and time range; KPIs = **conversas iniciadas / rastreadas / não rastreadas / conversões enviadas**; volume trend, rastreio donut, and a per-client performance table. Click a client → Cliente detalhe.
- **Clientes** (`screens/Clientes.jsx`) — all clients with totals, **filter by Pixel**, search, sparkline trend, ROAS. Click a client → Cliente detalhe.
- **Cliente detalhe** (`screens/ClienteDetalhe.jsx`) — per-client overview: the 4 KPIs, evolução, origem donut, and the **leads recebidos** list (segmented: todos / rastreados / não rastreados; filter by pixel). Click a lead → Lead detalhe.
- **Lead detalhe** (`screens/LeadDetalhe.jsx`) — full lead record: identity, **rastreamento** journey (campanha → conjunto → anúncio → clique → WhatsApp) or "origem não identificada", UTM params, and a **WhatsApp conversation panel that is disabled by default** (privacy opt-in toggle → reveals the chat).
- **Relatórios** (`screens/Relatorios.jsx`) — **BI**: report header band, ROAS / CPL / conversões / lucro cards, conversas trend, **investimento de mídia** bars, per-client ROAS ranking. Scope to **toda a operação** or a single client; **Exportar PDF** / **Gerar p/ cliente**.
- **Integrações** (`App.jsx`) — Meta Pixel connections per client with status.

## Structure
- `index.html` — loads the bundle + `data.js` + all screen scripts, mounts `window.WppApp`.
- `data.js` — mock operation (6 clients, pixels, leads, 14-day trend, sample chat). Sets `window.WT`.
- `shared.jsx` — `Icon` (Lucide) + inline-SVG charts (`Donut`, `LineChart`, `BarMini`, `Spark`).
- `AppShell.jsx` — sidebar (agency nav) + topbar; `ClientAvatar`, `Segmented`.
- `App.jsx` — screen router (owns theme + navigation state).

**Composes** the core primitives (`Button`, `Card`, `Badge`, `StatCard`, `Tag`, `Input`) from `components/core/`. Charts are hand-rolled inline SVG (no chart lib). Icons via Lucide CDN.

## Conexões & configuração (fluxos de agência)
- **Conectar Pixel** (`modals.jsx`) — modal que salva **ID do pixel + token permanente** (criptografado); abre por Integrações, Configurações da agência e config do cliente.
- **Novo cliente** (`modals.jsx`) — wizard de 4 etapas: Dados → Conta de anúncio & Pixel → Conectar WhatsApp → Etiquetas→eventos.
- **Conectar WhatsApp** (`modals.jsx`) — provedor (Evolution / Cloud API) + 3 métodos: **QR Code**, **enviar link** (página pública) e **código de integração**.
- **Página pública do QR** (`qr.html`) — tela white-label que o cliente abre para escanear (marca da agência).
- **Configurações da agência** (`screens/Configuracoes.jsx`) — abas **Business Managers** (várias BMs → contas → pixels via Marketing API), **WhatsApp** (provedores) e **IA** (provedores + API Keys).
- **Configurações do cliente** (`screens/ClienteConfig.jsx`) — abas **Conta & Pixels**, **WhatsApp** (conexão + provedor), **Etiquetas → eventos** (puxa etiquetas e mapeia cada uma a um evento da Meta) e **IA** (liga análise automática por cliente).
- **Lead** — usa **CTWA Clid** (campanhas de WhatsApp, não FBclid) + card de **análise da IA** (intenção, qualidade, estágio, resumo) quando a IA está ativa no cliente.

### Eventos da Meta suportados (pixel de mensagem)
Purchase · LeadSubmitted · InitiateCheckout · AddToCart · ViewContent · OrderCreated · OrderShipped · OrderDelivered · OrderCanceled · OrderReturned · CartAbandoned · QualifiedLead · RatingProvided · ReviewProvided

> Metrics follow the product definition: a conversation is **rastreada** when the source ad (campanha/conjunto/anúncio) was identified, **não rastreada** when it started without tracking parameters (organic / direct).
