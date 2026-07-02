# Projeto WppTrack SaaS

Este documento e a memoria persistente do projeto. Sempre que uma nova conversa ou contexto comprimido acontecer, leia este arquivo primeiro antes de tomar decisoes de produto, arquitetura ou implementacao.

## Estado Atual

- Workspace: `C:\Users\samue\Documents\dash-com-ia\dash-com-ia`.
- Design system original copiado de `C:\Users\samue\Downloads\WppTrack Design System` para `wpptrack-design-system/`.
- Visualizador do design system: `visualizacao-wpptrack.html`.
- Visual inicial do SaaS para cliente final: `wpptrack-saas-visual.html`.
- Spec formal aprovada em fluxo de brainstorming: `docs/superpowers/specs/2026-07-01-wpptrack-saas-design.md`.
- Plano de implementacao da Fase 1: `docs/superpowers/plans/2026-07-01-wpptrack-foundation-shell-implementation.md`.
- A Fase 1 cria monorepo, app web navegavel, API NestJS, contratos compartilhados, Prisma e BullMQ sem integrar provedores reais ainda.
- Implementacao atual da Fase 1: Tasks 1-9 executadas e commitadas, cobrindo monorepo, contratos compartilhados, shell da API NestJS, shell web navegavel, rota de login, schema/service Prisma, fila diagnostica BullMQ, testes de navegacao/login do web, README e handoff do projeto.
- Verificacao final executada: `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `prisma generate` e `prisma validate` passaram.
- Docker Desktop foi aberto e validado em 2026-07-02; `docker compose up -d postgres redis` subiu Postgres em `5432` e Redis em `6379`.
- Migrations reais do Prisma foram criadas e aplicadas no Postgres local: `20260702031728_init_wpptrack_foundation` e `20260702032400_auth_refresh_hash_unique`.
- Autenticacao propria avancou para endpoints HTTP reais no NestJS: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` e `POST /auth/logout`.
- Cadastro cria usuario por email/senha, workspace inicial com papel `owner`, sessao persistida em `AuthSession`, refresh token opaco e cookie `HttpOnly`.
- Google OAuth agora possui fluxo backend real: `POST /auth/google/start` monta a URL de autorizacao com scopes `openid email profile`; `GET /auth/google/callback` troca o `code` em `https://oauth2.googleapis.com/token`, busca perfil em `https://openidconnect.googleapis.com/v1/userinfo`, cria/linka usuario Google, cria workspace inicial para usuario novo, abre sessao com cookie `HttpOnly` e redireciona o navegador de volta para o frontend usando `WEB_ORIGIN`.
- Frontend de login agora possui link funcional `Entrar com Google`: `/login/google` chama o backend `/auth/google/start` e redireciona para o Google quando configurado, ou volta para `/login?error=google_env` quando faltam credenciais. A tela de login tambem exibe mensagens claras para erros de callback Google (`google_env`, `google_exchange`, `google_pending`).
- Recuperacao de senha e verificacao de email receberam scaffold persistente: `AuthActionToken` no Prisma, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/email/verification/start` e `POST /auth/email/verification/confirm`. Tokens ficam hasheados no banco e so sao retornados em desenvolvimento/controlado com `AUTH_EXPOSE_DEV_TOKENS=true`.
- Wave 2 backend executada em 2026-07-02 com plano em `docs/superpowers/plans/2026-07-02-wpptrack-wave-2-real-saas-backend.md`.
- Workspace API real adicionada: `GET /workspaces/current`, `GET /workspaces/current/members` e `POST /workspaces/current/invites`.
- Convites de workspace agora possuem aceite autenticado: `POST /workspaces/invites/accept` valida token, email do usuario convidado, status pendente e expiracao, cria `WorkspaceMember` e marca o convite como `accepted`.
- Diagnosticos persistentes implementados com Prisma/API: `DiagnosticEvent`, `WebhookLog`, `IntegrationLog`, `ConversionEventLog`, `JobAttempt` e `AuditLog`; endpoints iniciais em `/backoffice/diagnostics/events`.
- Central de Diagnostico agora possui retry auditado: `POST /backoffice/diagnostics/events/:id/retry` valida motivo, cria `AuditLog` com acao `diagnostic.retry_requested`, cria `JobAttempt` em `diagnostics.retry` e retorna status `queued`, sem reexecutar integracoes externas nesta etapa.
- API de integracoes exposta sem credenciais externas: `GET /integrations/health`, `GET /integrations/meta/start`, `GET /integrations/uazapi/start` e `GET /integrations/asaas/status`.
- Billing/ativacao de instancia WhatsApp scaffoldado: `GET /billing/whatsapp-instance/quote` e `POST /billing/whatsapp-instance/checkout`; checkout cria instancia `pending_payment`, cobranca pendente e ativacao pendente, sem liberar uso antes de webhook/pagamento futuro.
- Checkout de instancia agora retorna metadados explicitos de pagamento: `paymentProvider: asaas`, `paymentProviderStatus` e `externalChargeId`. Sem credenciais ou sem `asaasCustomerId` no workspace, o status fica `not_configured` e a cobranca segue local/pendente para preservar o fluxo pagamento-antes-da-ativacao.
- Criacao real de cobranca Asaas foi preparada no backend: `AsaasAdapter` chama `POST /payments` com header `access_token`, `billingType: UNDEFINED`, valor em reais, `externalReference` apontando para a cobranca local e split percentual por `walletId` dos `SplitReceiver` ativos. Quando Asaas responde com `id`/`invoiceUrl`, o backend persiste `externalChargeId` e `checkoutUrl`.
- Migrations reais adicionais aplicadas no Postgres local: `20260702034254_diagnostics_logs` e `20260702034847_billing_activation`.
- Frontend parcialmente conectado ao backend: tela de login/cadastro chama `/auth/login` e `/auth/register`; pagina de integracoes tenta ler `/integrations/health`; backoffice tenta ler eventos diagnosticos, workspaces de billing e recebedores reais sem fallback demonstrativo.
- Frontend agora possui middleware de protecao para `/overview`, `/leads`, `/reports`, `/integrations`, `/settings` e `/backoffice`, exigindo cookie `wpptrack_session`; o shell possui acao de logout chamando `/auth/logout`.
- Webhooks publicos iniciais adicionados para registrar rastros operacionais: `POST /webhooks/uazapi`, `POST /webhooks/asaas` e `POST /webhooks/meta`; eles gravam `WebhookLog` sanitizado e `DiagnosticEvent` vinculado.
- Regras de conversao configuraveis implementadas em 2026-07-02: backend Prisma/API para gatilhos por `keyword` e `whatsapp_label`, endpoints `/conversion-rules`, `/conversion-rules/:id` e `/conversion-rules/evaluate`, schema compartilhado e tela `Configuracoes` lendo regras reais com estados vazio/erro sem fallback demonstrativo.
- Migration real adicional aplicada no Postgres local: `20260702040655_conversion_rules`.
- Verificacao apos regras de conversao: `pnpm test` passou com API 17 arquivos/44 testes, shared 16 testes e web 3 arquivos/8 testes; `pnpm typecheck` passou; `prisma migrate status` indicou schema atualizado com 5 migrations.
- Processamento inicial de webhook Asaas implementado: `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` ou status `RECEIVED`/`CONFIRMED` busca a cobranca por `externalChargeId` ou `chargeId` local, marca `PaymentCharge` como `paid`, ativa `WhatsappInstanceActivation` e muda a `WhatsappInstance` para `active`.
- Webhook Asaas agora suporta protecao opcional por `ASAAS_WEBHOOK_AUTH_TOKEN`: quando configurado, o backend exige o header oficial `asaas-access-token` antes de gravar diagnostico ou ativar cobranca.
- A criacao real da cobranca no Asaas agora esta plugada ao checkout, mas depende de `ASAAS_BASE_URL`, `ASAAS_API_KEY` e `Workspace.asaasCustomerId`. O backoffice ja possui listagem/tela protegida para configurar o customer Asaas por workspace sem abrir banco ou terminal.
- Webhook Uazapi agora avalia regras de conversao quando recebe `x-workspace-id`: extrai texto de mensagem e etiquetas comuns do payload, executa `/conversion-rules` internamente e cria `ConversionEventLog` para regras encontradas, com status `ready_to_send` quando ha `pixelId` e `adId`, ou `pending_meta_context` quando falta contexto Meta.
- Integracao Uazapi/WhatsApp ganhou camada inicial de conexao para instancias pagas: `GET /integrations/whatsapp/instances/:id/status`, `POST /integrations/whatsapp/instances/:id/connect` e `GET /integrations/whatsapp/instances/:id/qr`. O backend valida a sessao/workspace, recusa instancia `pending_payment`, chama a Uazapi apenas server-side e retorna status/QR sanitizado sem expor token.
- A API tambem lista instancias WhatsApp do workspace em `GET /integrations/whatsapp/instances`; a aba `Integracoes` consome essa lista, mostra nome/status de pagamento/id Uazapi e oferece acao server-side para conectar instancias ativas.
- `WhatsappInstance` agora possui `providerInstanceId` para mapear a instancia local ao identificador criado/retornado pelo provider Uazapi; migration `20260702095000_whatsapp_provider_instance` adiciona esse campo e indice.
- Verificacao da fatia Uazapi: `pnpm test`, `pnpm typecheck`, `pnpm build` e `prisma validate` passaram. `prisma migrate deploy/status` ficou pendente localmente porque o Docker Desktop/engine nao estava acessivel (`dockerDesktopLinuxEngine` indisponivel), mas a migration esta versionada.
- Envio Meta CAPI recebeu adapter plugavel: `MetaCapiAdapter` envia eventos para `/{PIXEL_ID}/events` usando `META_CAPI_ACCESS_TOKEN` e `META_GRAPH_API_VERSION`; `ConversionEventsService.sendReadyEvent` pega logs `ready_to_send`, envia para a Meta quando possivel e atualiza `ConversionEventLog` para `sent`, `error` ou `not_configured` com resposta resumida.
- OAuth Meta real avancou no backend: `GET /integrations/meta/start` agora monta a URL oficial de autorizacao da Meta com `META_APP_ID`, `META_OAUTH_REDIRECT_URL`, `META_GRAPH_API_VERSION` e `META_OAUTH_SCOPES`; `GET /integrations/meta/callback` valida `code/state`, troca o code no Graph `/oauth/access_token` server-side com `META_APP_SECRET` e retorna somente metadados sanitizados, sem expor access token ao frontend.
- Persistencia segura do OAuth Meta por workspace implementada: `MetaIntegration` armazena access token criptografado com AES-256-GCM usando `META_TOKEN_ENCRYPTION_KEY`, scopes, expiracao, status e selecoes futuras de BM/conta/pixel. O callback OAuth usa `state` assinado para identificar o workspace, salva a conexao e retorna apenas DTO sanitizado. A aba `Integracoes` consulta `GET /integrations/meta/connection` e mostra status/escopos/pixel sem expor token.
- Primeira camada de ativos Meta implementada: `GET /integrations/meta/assets` usa o token OAuth criptografado/descriptografado apenas no backend para buscar `businesses`, `owned_ad_accounts` e `adspixels` no Graph API; `PUT /integrations/meta/assets/selection` salva BM, conta de anuncio e Pixel selecionados no `MetaIntegration`. A aba `Integracoes` mostra BM/conta/pixel selecionados e estados humanos de conexao/sincronizacao. Sincronizacao persistente de campanhas/conjuntos/anuncios e metricas ainda fica para a proxima onda Meta.
- Aba `Integracoes` agora possui formulario real para salvar selecao Meta BM/conta/pixel via `PUT /integrations/meta/assets/selection`; os botoes placebo de selecionar foram substituidos por leitura do ativo selecionado.
- Primeira camada de reporting Meta persistente implementada: novos snapshots `MetaCampaign`, `MetaAdSet` e `MetaAd` guardam campanhas, conjuntos e anuncios por workspace/conta selecionada. `POST /reports/meta/sync` agora enfileira a sincronizacao na fila BullMQ `meta-report-sync`; o worker `MetaReportSyncProcessor` busca campanhas/adsets/ads/insights no Graph API usando o token OAuth somente no backend e persiste investimento, impressoes, cliques e conversas Meta por campanha. `GET /reports/campaigns` monta `ReportOverviewDto` cruzando snapshots Meta com `ConversionEventLog` interno para `LeadSubmitted`, `QualifiedLead` e `Purchase`. A tela `Relatorios` tenta ler esse endpoint real, mostra estados vazio/erro sem dados demonstrativos e possui botao `Sincronizar Meta`.
- Estrutura Meta detalhada em relatorios implementada: `GET /reports/meta/structure` retorna campanhas com conjuntos e anuncios a partir dos snapshots `MetaCampaign`, `MetaAdSet` e `MetaAd`. A tela `Relatorios` renderiza a tabela `Estrutura Meta` com campanha, conjunto, anuncio e status, permitindo inspecionar se a sincronizacao trouxe a hierarquia usada nos relatorios.
- Filtros de periodo iniciais em `Relatorios` implementados: a tela aceita `since` e `until` na query string, renderiza inputs de data e envia os mesmos filtros para `GET /reports/campaigns` e para o enqueue `POST /reports/meta/sync`. No backend, o range vira `rangeLabel` e filtra eventos internos (`ConversionEventLog.createdAt`) quando ambos os campos estao presentes.
- Relatorios agora calculam `realConversations` a partir de `Lead` por campanha e periodo, com `costPerRealConversationCents`. A tela `Relatorios` deixou de injetar campanhas demo fixas e nao renderiza campanha ou metrica ficticia quando o backend nao responde.
- Visao Geral agora consome `GET /reports/campaigns`, agrega todas as campanhas retornadas pela API para KPIs e funil, lista campanhas do recorte e troca os indicadores hardcoded de qualidade por taxas derivadas dos dados. Quando a API nao responde, mostra estado indisponivel sem KPIs/campanhas ficticias.
- Visao Geral e Relatorios agora diferenciam estados `real`, `empty` e `error`: resposta real vazia exibe estado vazio sem dados demo; falha de API exibe estado indisponivel sem renderizar campanha ou metricas ficticias.
- Leads agora diferencia estados `real`, `empty` e `error`: resposta real vazia exibe estado vazio; falha de API mostra `API indisponivel`; a tela nao injeta mais leads/campanhas demonstrativos como fallback.
- Configuracoes agora diferencia estados `real`, `empty` e `error` para regras de conversao: resposta vazia orienta criar regra; falha de API mostra `API indisponivel`; a tela nao injeta mais regras demonstrativas.
- Backoffice de split recebeu API inicial: `GET /backoffice/split/receivers`, `POST /backoffice/split/receivers` e `PATCH /backoffice/split/receivers/:id`, usando `SplitReceiver` para nome, wallet Asaas, email, percentual em basis points e status ativo.
- Tela de backoffice agora consulta `/backoffice/split/receivers` e exibe recebedores, wallet Asaas, email, percentual e status; quando a API falha ou retorna vazia, mostra estado vazio/indisponivel sem recebedor demonstrativo.
- Tela de backoffice agora exibe acao de `Reprocessar` para eventos reais da Central de Diagnostico; a acao chama o retry auditado `POST /backoffice/diagnostics/events/:id/retry` via server action e mostra estado vazio/indisponivel sem linhas demonstrativas quando nao ha eventos reais.
- Cards do backoffice agora usam apenas contagens derivadas dos endpoints carregados (`workspaces/billing`, `split/receivers`, `diagnostics/events`) e nao exibem mais MRR, volume de workspaces, alertas, jobs ou tokens ficticios.
- Central de Diagnostico ganhou pagina de detalhe em `/backoffice/diagnostics/:eventId`, consumindo `GET /backoffice/diagnostics/events/:id`, exibindo metadados, payload sanitizado e acao auditada de `Reprocessar evento`. A listagem do backoffice agora aponta cada evento para essa pagina.
- Detalhe da Central de Diagnostico agora retorna e renderiza `timeline` operacional com o proprio evento, webhook relacionado, auditorias de retry e tentativas de job vinculadas ao diagnostico. A meta e permitir investigacao pelo frontend interno sem abrir banco, preservando payloads sanitizados.
- Reprocessamento da Central de Diagnostico ganhou primeiro caminho real por worker: `POST /backoffice/diagnostics/events/:id/retry` continua criando `AuditLog` e `JobAttempt`, mas agora tambem enfileira `retry-diagnostic-event` na fila `diagnostic-events`. O `DiagnosticProcessor` reenvia conversoes vinculadas a `ConversionEventLog` via `ConversionEventsService.sendReadyEvent`; diagnosticos sem alvo reprocessavel sao pulados com motivo seguro, sem chamar provedores externos cegamente.
- Central de Diagnostico agora possui filtros reais de investigacao no contrato, API e backoffice: busca textual (`q`), periodo (`since`/`until`), workspace, origem, severidade, status, tipo de evento, lead, telefone hash, campanha, conjunto, anuncio e codigo de erro.
- Docker Desktop foi reiniciado pelo Codex em 2026-07-02 quando a distro WSL `docker-desktop` estava parada e o pipe `dockerDesktopLinuxEngine` ausente. Apos iniciar o Desktop, `docker compose ps` mostrou Postgres/Redis `Up` com portas `5432` e `6379` publicadas; `prisma migrate deploy` aplicou as migrations pendentes `20260702095000_whatsapp_provider_instance`, `20260702103000_meta_integration` e `20260702110000_meta_reporting_snapshots`; `prisma migrate status` confirmou banco atualizado.
- Base de deploy Vercel + Dokploy documentada em `docs/deploy/vercel-dokploy.md`: topologia, variaveis, healthchecks, ordem de deploy, callbacks e validacao pos-deploy. A API tambem ganhou `GET /health/ready`, que valida PostgreSQL e Redis e retorna `503` quando alguma dependencia essencial falha, alem do script `pnpm --filter @wpptrack/api start` para runtime em producao.
- Endpoints internos de backoffice agora exigem sessao valida e allowlist `WPPTRACK_PLATFORM_ADMIN_EMAILS`; usuarios autenticados fora da allowlist recebem acesso negado. As paginas server-side usam `serverApiFetch` para repassar cookie ao backend.
- Backoffice de workspaces ganhou configuracao operacional de billing: `GET /backoffice/workspaces/billing` lista workspaces com `asaasCustomerId`; `GET/PATCH /backoffice/workspaces/:workspaceId/billing` permite visualizar/atualizar o customer Asaas, necessario para criar cobrancas reais no Asaas sem abrir o banco. A tela interna de backoffice ja renderiza essa lista e salva alteracoes por server action.
- Rodada Paralela 1 executada e revisada: visual WppTrack/Telemetria Noturna aplicado ao web, Auth/Workspaces iniciado, scaffolds de integracoes Meta/Uazapi/Asaas criados e spec de Diagnosticos/Logs adicionada.
- Verificacao da Rodada Paralela 1: `pnpm test`, `pnpm typecheck`, `pnpm build`, `prisma generate` e `prisma validate` passaram. O bloqueio anterior do Docker Desktop Linux engine foi resolvido quando o Docker Desktop foi aberto.
- Spec e plano da Rodada Paralela 1: `docs/superpowers/specs/2026-07-02-wpptrack-parallel-wave-1-design.md` e `docs/superpowers/plans/2026-07-02-wpptrack-parallel-wave-1-implementation.md`.
- Servidor local usado para visualizar: `http://127.0.0.1:5174/`.
- Repositorio inicial ja possui commits da fundacao da Fase 1.
- Diagnosticos/logs operacionais possuem spec dedicada em `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`; a implementacao Prisma/API ja existe com retry auditado seguro e primeira acao no backoffice. Raw payload autorizado, telas detalhadas e reprocessamento real por worker ficam para ondas posteriores.

## Objetivo do Produto

Transformar o design system/prototipo visual WppTrack em um SaaS funcional e robusto para o cliente final, nao para agencias.

O produto deve permitir que uma empresa conecte seu WhatsApp, sua conta Meta Ads/Pixels e acompanhe a jornada:

`anuncio -> clique -> WhatsApp -> lead -> conversa -> conversao -> evento enviado ao Pixel/Meta Ads`

O foco principal e dar clareza operacional e performance para campanhas de WhatsApp, mostrando de onde vem cada lead, quais campanhas/publicos/criativos performam melhor e quais conversoes foram enviadas para o Pixel.

## Decisoes Confirmadas

- O produto nao sera vendido inicialmente como painel de agencia.
- A aba `Clientes` sera removida.
- O usuario representa uma unica empresa/operacao final.
- A plataforma deve ser robusta desde o inicio; nao seguir caminho de MVP enxuto.
- Prioridade escolhida no brainstorming: **B - Relatorios fortes desde o inicio**.
- Nucleo da primeira versao robusta de relatorios: **D - tudo junto desde o inicio**, cruzando trafego + leads + conversoes em uma visao integrada.
- Fonte de verdade inicial dos dados de trafego: **Meta Ads real via OAuth desde o inicio**.
- O usuario ja possui um app Meta criado e rodando em outro SaaS, com permissoes no Meta. A estrategia sera aproveitar esse mesmo app Meta para a integracao do WppTrack, se tecnicamente e operacionalmente viavel.
- Integracao WhatsApp: a plataforma deve suportar mais de um provedor, mas a primeira integracao pratica sera com **Uazapi**, nao Evolution API.
- WhatsApp Cloud API oficial deve ficar mapeada na arquitetura desde o inicio, mas depende de liberacao/permissoes no app Meta que o usuario fara em breve.
- Stack tecnica escolhida: **Next.js + NestJS**.
- Banco e filas escolhidos: **PostgreSQL + Prisma + BullMQ/Redis**.
- Modelo de conta: **Workspace/empresa com multiplos usuarios desde o inicio**.
- Isso nao reintroduz a camada de agencias/clientes; cada workspace representa uma empresa final, que pode convidar membros internos.
- Autenticacao: **sistema proprio**, sem depender de provedores externos como Clerk/Auth0.
- Login previsto: **email/senha** e **Google OAuth**.
- Implementacao atual cobre email/senha completo, recuperacao de senha, verificacao de email e Google OAuth real pelo backend. Para usar Google em ambiente real, configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `WEB_ORIGIN` no backend e cadastrar o callback correspondente no Google Cloud Console. `GOOGLE_REDIRECT_URI` aponta para o backend (`/auth/google/callback`) e `WEB_ORIGIN` aponta para o frontend que recebera o usuario autenticado.
- Papeis iniciais no workspace: **owner, admin e member**.
- A arquitetura de permissoes deve ser preparada para evoluir para permissoes granulares no futuro, por exemplo: ver relatorios, gerenciar integracoes, exportar dados, convidar usuarios e administrar cobranca.
- IA de analise de conversa: **estrutura preparada desde o inicio, mas recurso desligado/fora do foco inicial**.
- A prioridade inicial continua sendo trafego + leads + conversoes + relatorios integrados.
- Cobranca/planos: **assinatura desde o inicio usando Asaas**.
- O Asaas sera usado para pagamento recorrente, emissao automatica de NF quando aplicavel e split de pagamento.
- Os planos de assinatura serao criados e administrados pela plataforma WppTrack; usuarios/clientes finais nao criam planos.
- Logica inicial de planos/cobranca: cobrar por **numero de instancias de WhatsApp conectadas**.
- Nao limitar por numero de conversas/leads no primeiro momento, pois a plataforma nao tera chat e a proposta e evitar atrito por volume de conversa.
- Regra importante: **nova instancia de WhatsApp so deve ser liberada apos pagamento confirmado**.
- Fluxo desejado: ao adicionar instancia, o frontend mostra o valor fixo por instancia; o backend cria a cobranca/checkout no Asaas; o usuario paga; o webhook do Asaas confirma; somente entao a instancia muda de pendente para ativa.
- Implementacao atual ja cobre o controle interno desse fluxo: checkout local deixa instancia/cobranca/ativacao pendentes, tenta criar cobranca real no Asaas quando o workspace possui `asaasCustomerId`, identifica o provedor Asaas e o webhook Asaas confirmado ativa a instancia.
- Evitar modelo "usa agora e paga depois", para reduzir risco de inadimplencia/calote.
- O valor por instancia deve ser previsivel para o usuario, por exemplo: `quantidade de instancias ativas x valor fixo por instancia`.
- Split Asaas: sera **percentual**, com contas/recebedores fixos definidos pela plataforma para socios do projeto. Usuarios finais nao configuram split.
- Deve existir uma area interna/backoffice para os donos do SaaS, invisivel para usuarios finais.
- Acesso ao backoffice deve ser controlado por sessao e allowlist de emails da plataforma em `WPPTRACK_PLATFORM_ADMIN_EMAILS`.
- No backoffice interno, os donos do SaaS poderao configurar as contas recebedoras do split Asaas e seus percentuais.
- O backoffice de split deve permitir adicionar/remover socios/recebedores e ajustar percentuais quando houver mudanca societaria.
- Implementacao atual ja possui API para listar, criar e atualizar recebedores de split, a tela de backoffice ja lista esses recebedores, e os recebedores ativos sao enviados como split percentual na criacao real das cobrancas Asaas.
- Backoffice interno aprovado: modelo **B+**, com financeiro/split, gestao de clientes/workspaces e uma **Central de Diagnostico** operacional.
- A Central de Diagnostico deve permitir que o dono da plataforma, mesmo sem abrir banco/terminal, investigue problemas de webhooks, conversoes, Meta, Uazapi e Asaas.
- Hospedagem/deploy escolhido: **Vercel para Next.js** e **VPS/Dokploy para NestJS, PostgreSQL, Redis/BullMQ e workers**.
- Abordagem de construcao aprovada: **Esqueleto navegavel completo + motor real por tras**.
- Primeiro a plataforma deve ganhar uma experiencia navegavel completa com painel do cliente, relatorios, integracoes, configuracoes e backoffice B+. Em paralelo/na sequencia, o backend real substitui mocks por dados reais modulo por modulo.
- Cuidado importante: mocks devem ser temporarios e rastreados como tal, para nao virarem produto falso.
- O design system WppTrack deve continuar sendo a base visual.
- A linguagem do produto sera pt-BR, falando com o usuario como "voce".
- O produto deve manter aparencia B2B SaaS limpa, tecnica, confiavel e orientada a performance.

## Navegacao Planejada

A navegacao principal do SaaS para cliente final deve conter:

1. `Visao geral`
   - Painel principal da operacao.
   - KPIs de conversas, rastreio, conversoes, eventos e resultados.
   - Grafico de funil da jornada: anuncio -> clique/conversa Meta -> conversa real -> LeadSubmitted -> QualifiedLead -> Purchase.
   - Botao de atualizacao manual/refresh para forcar nova leitura dos dados quando permitido.
   - Sem filtro de "clientes".

2. `Leads`
   - Lista de leads recebidos pelo WhatsApp.
   - Filtros por status, campanha, origem, rastreado/nao rastreado, periodo e conversao.
   - Busca por nome e telefone usando comportamento padrao de "contem".
   - Tabela com dados do lead, status, UTMs, origem, campanha/conjunto/anuncio e eventos enviados.
   - Botao de atualizacao manual/refresh dos dados da tabela.
   - Detalhe do lead com jornada de rastreamento, UTM/CTWA, conversa e historico de eventos.

3. `Relatorios`
   - Area forte do produto desde o inicio.
   - Relatorios de campanha, publico/conjunto, criativo/anuncio, funil e conversoes.
   - Painel de Campanhas, Conjuntos e Anuncios com metricas de trafego + leads + conversoes.
   - Botao de atualizacao manual/refresh para sincronizar metricas Meta quando permitido.
   - Acoes operacionais sobre Meta Ads, quando a permissao do app Meta permitir: ativar/desativar campanha, conjunto ou anuncio; alterar orcamento.
   - Essas acoes devem exigir confirmacao visual, permissao adequada e gerar log/auditoria.
   - Deve absorver informacoes que no prototipo atual aparecem em `Configuracoes`, especialmente dados de BM, contas de anuncio e estrutura Meta.
   - Nao deve ter comparativo entre varios clientes.

4. `Integracoes`
   - Conexao WhatsApp.
   - Conexao Meta/Pixels.
   - Status de integracao, webhooks, saude do envio de eventos e ultimas sincronizacoes.

5. `Configuracoes`
   - Deve existir, mas com escopo minimo e operacional.
   - Nada de configuracoes de agencia/multicliente.
   - Possiveis itens: perfil da empresa, usuarios, preferencias, mapeamento de eventos, API keys/provedores quando necessario.
   - Configuracao da versao da API da Meta, quando for necessario controlar ou migrar versoes.
   - Configuracao/visualizacao da BM, conta de anuncio, Pixel e pagina conectados via OAuth Meta.
   - A direcao principal segue OAuth Meta; token permanente manual so deve ser fallback tecnico/admin, nao fluxo principal para usuario final.
   - Configuracao de IA deve ficar preparada, com OpenRouter como opcao futura de provedor, mas fora do foco inicial.

## Backoffice Interno da Plataforma

Area separada e invisivel para clientes finais, destinada aos donos/operadores do SaaS.

Escopo aprovado: **B+**.

Funcionalidades iniciais:

- Financeiro da plataforma.
- Planos e assinaturas.
- Cobrancas Asaas.
- Configuracao de recebedores e percentuais de split.
- Gestao de workspaces/clientes.
- Status de assinatura de cada workspace.
- Instancias WhatsApp conectadas por workspace.
- Status das integracoes Meta/Pixels e WhatsApp.
- Bloqueio/desbloqueio operacional quando necessario.

Central de Diagnostico:

- Visualizar webhooks recebidos por workspace, integracao, tipo e periodo.
- Filtrar logs por cliente/workspace, instancia WhatsApp, lead, telefone, campanha, evento ou erro.
- Ver eventos de conversao enviados ao Pixel.
- Ver eventos enviados com status de sucesso e erro.
- Ver falhas e respostas da Meta.
- Ver falhas e respostas da Uazapi.
- Ver eventos do Asaas ligados a pagamento, assinatura e ativacao de instancia.
- Ver execucoes de automacao/extracao Meta com status de sucesso e erro.
- Ver mudancas em campanhas, conjuntos e anuncios com status de sucesso e erro.
- Mostrar tentativas, status, payload resumido, resposta externa e proximo retry.
- Permitir acao de reenfileirar/tentar novamente quando for seguro. A API de retry auditado e o primeiro botao no backoffice ja existem; ainda falta tela detalhada e worker real para reprocessar integracoes externas.
- Objetivo: permitir debug operacional pelo frontend interno sem exigir que o dono da plataforma abra banco de dados ou terminal.

## Funcionalidades Removidas do Prototipo Atual

- Gestao de multiplos clientes.
- Ranking por cliente.
- Filtros "Todos os clientes".
- Cliente detalhe e cliente config como entidades centrais.
- Wizard de "Novo cliente".
- Estrutura de agencia como `Agencia Norte`.
- Business Managers multiplos como recurso de agencia.

## Funcionalidades Mantidas e Adaptadas

- Dashboard/visao geral.
- Leads e detalhe do lead.
- Relatorios/BI.
- Integracoes com WhatsApp e Meta Pixel.
- Configuracoes, porem reduzidas ao contexto do cliente final.
- Light/dark mode do design system.
- Cards, tabelas, metricas, charts e componentes visuais do WppTrack.

## Direcao de Relatorios

Como a prioridade escolhida foi "Relatorios fortes desde o inicio", a area de relatorios deve ser planejada como nucleo do produto, nao como uma tela simples.

O usuario escolheu que a primeira versao robusta deve cruzar tudo desde o inicio:

`trafego Meta Ads -> campanhas/conjuntos/anuncios -> leads WhatsApp -> conversoes/eventos Pixel`

Relatorios esperados:

- Campanhas.
- Conjuntos/publicos.
- Criativos/anuncios.
- Funil da operacao.
- Leads por origem.
- Conversoes enviadas.
- Eventos por etiqueta/status.
- Investimento, CPL, custo por conversa, taxa de rastreio, ROAS atribuido.
- Quantidade de conversas iniciadas no Facebook/Meta.
- Custo por conversas iniciadas no Facebook/Meta.
- Quantidade de conversa real, ou seja, lead que entrou em contato no WhatsApp.
- Custo por conversa real.
- Quantidade de lead real: evento `LeadSubmitted`.
- Custo por lead real: `LeadSubmitted`.
- Quantidade de lead qualificado real: evento `QualifiedLead`.
- Custo por lead qualificado real: `QualifiedLead`.
- Quantidade de compra real: evento `Purchase`.
- Custo por compra real: `Purchase`.
- Comparacao entre periodos.
- Drill-down: campanha -> conjunto -> anuncio -> leads -> conversoes.

Direcao confirmada: os relatorios devem ser integrados, permitindo entender resultado real por campanha, conjunto e anuncio, incluindo volume de leads, rastreio, custo, conversoes e eventos enviados.

As metricas acima devem aparecer no Painel de Campanhas, Conjuntos e Anuncios sempre que os dados estiverem disponiveis pela Meta e pelos eventos internos.

Pendente de definicao: confirmar nomes finais das metricas na UI, formulas exatas e quais dependem de permissoes especificas da API Meta.

## Eventos e Automacoes

- O produto deve permitir configurar palavras-chave que disparam eventos.
- O produto tambem deve permitir configurar etiquetas do WhatsApp Business como gatilho para disparo de eventos.
- Gatilhos de conversao aprovados:
  - Palavra-chave recebida na conversa.
  - Etiqueta aplicada ao chat/lead no WhatsApp Business, inicialmente via Uazapi.
- No cadastro da regra, o usuario deve escolher o gatilho e o evento Meta a enviar, por exemplo: `LeadSubmitted`, `QualifiedLead`, `Purchase` ou outros eventos suportados.
- Implementacao atual ja permite criar, listar, atualizar e avaliar regras ativas. O envio Pixel/CAPI possui adapter e metodo de processamento para logs `ready_to_send`, mas ainda falta plugar worker/fila e credenciais reais por workspace.
- Webhooks Uazapi ja conseguem aplicar as regras, registrar logs de conversao internos e enfileirar envio Pixel/CAPI para cada log criado. Quando ha `pixelId`, `ad_id` e token CAPI configurado, o worker tenta enviar para a Meta; quando falta contexto/credencial, o log registra o estado operacional sem liberar falso sucesso.
- Envio Pixel/CAPI agora possui fila BullMQ dedicada: webhooks Uazapi criam `ConversionEventLog` e enfileiram jobs na fila `conversion-events`; `ConversionEventProcessor` executa `ConversionEventsService.sendReadyEvent` em worker com retry, evitando que o webhook fique preso na chamada externa da Meta.
- Para enviar um evento ao Pixel, o backend deve buscar o `ad_id` do lead.
- Se houver mais de uma BM/conta conectada no futuro, o backend deve validar a qual BM/conta pertence o anuncio antes de enviar o evento.
- O fluxo padrao do cliente final continua sendo BM/conta de anuncio unica, mas a arquitetura deve tolerar mais de uma conexao Meta quando isso for necessario.
- Uazapi tem endpoints/documentacao publica envolvendo "Chats, Bloqueios, Contatos e etiquetas", incluindo buscar etiquetas e etiquetar chat. Antes da implementacao, validar no contrato real se a Uazapi dispara webhook quando uma etiqueta e adicionada/removida.
- Se a Uazapi nao enviar webhook de mudanca de etiqueta, usar alternativa tecnica: sincronizacao periodica, refresh manual ou job de verificacao de alteracoes recentes.
- Na futura WhatsApp Cloud API oficial, nao assumir suporte a etiquetas nativas do WhatsApp Business App ate confirmacao. Se necessario, usar tags internas do WppTrack como equivalente.
- Mudancas operacionais em campanhas, conjuntos e anuncios, como ativar/desativar ou alterar orcamento, devem gerar log de auditoria com sucesso/erro.
- Execucoes de automacao de extracao/sincronizacao Meta devem gerar logs de sucesso/erro.

## Integracoes Previstas

### WhatsApp

Conectar WhatsApp para receber/relacionar conversas e leads.

Direcao confirmada:

- Primeira conexao operacional: **Uazapi**.
- Segunda conexao planejada: **WhatsApp Cloud API oficial**.
- A arquitetura deve ter uma camada de provedores/adapters para facilitar plugar a Cloud API oficial depois.

Nao usar Evolution API como provedor prioritario, apesar de ela aparecer no design system original.

Pendente de definicao: contrato tecnico da Uazapi, formato dos webhooks, autenticacao, endpoints de envio/recebimento, status de conexao e limites operacionais.

### Meta / Pixel

Conectar a conta Meta para acessar:

- Business Manager do cliente final.
- Conta de anuncio.
- Pixel.
- Pagina vinculada quando necessario para campanhas/WhatsApp.
- Campanhas, conjuntos e anuncios.
- Dados de investimento/performance quando permitido.
- Envio de eventos de conversao para o Pixel.
- Leitura e, se permitido, alteracao de status/orcamento de campanhas, conjuntos e anuncios.

Direcao confirmada: usar Meta Ads real via OAuth desde o inicio, aproveitando o app Meta ja existente do usuario, que roda em outro SaaS e ja possui permissoes no Meta.

Pendente de definicao: validar quais permissoes, produtos e callbacks esse app Meta ja possui, quais podem ser reutilizados diretamente e se sera necessario criar ambiente/app separado para o WppTrack.

### IA

IA de analise de conversa fica preparada, mas nao ativa como foco inicial.

- O Markdown de metricas cita OpenRouter como provedor para configurar token.
- OpenRouter deve ser considerado como opcao futura de provedor, junto com outros provedores que forem avaliados.
- A UI pode prever area de configuracao futura, mas a ativacao real depende de decisao posterior.

## Modelo Conceitual de Dados

Entidades provaveis:

- Usuario.
- Empresa/Workspace.
- MembroWorkspace.
- ConviteWorkspace.
- Role/Permissao.
- ContaOAuth.
- Sessao/AuthToken.
- RecuperacaoSenha.
- IntegracaoWhatsApp.
- IntegracaoMeta.
- Pixel.
- ContaAnuncio.
- Campanha.
- ConjuntoAnuncio/Publico.
- Anuncio/Criativo.
- Lead.
- Conversa/Mensagem.
- EventoConversao.
- MapeamentoEvento.
- RegraPalavraChaveEvento.
- DisparoEventoPalavraChave.
- RegraEtiquetaEvento.
- EtiquetaWhatsApp.
- DisparoEventoEtiqueta.
- Sincronizacao.
- SincronizacaoMeta.
- MudancaCampanhaMeta.
- Relatorio/Exportacao.
- AnaliseIAConversa, prevista para futuro.
- PlanoAssinatura.
- AssinaturaWorkspace.
- Cobranca/Pagamento.
- NotaFiscal.
- SplitPagamento.
- RecebedorSplit.
- ConfiguracaoSplit.
- InstanciaWhatsApp como item importante para limites/cobranca.
- AtivacaoInstanciaWhatsApp/CobrancaAtivacao, para controlar pagamento antes da liberacao.
- LogWebhook.
- LogIntegracao.
- LogEventoEnviado.
- LogExtracaoMeta.
- LogMudancaCampanha.
- TentativaJob.
- DiagnosticoEvento.

Stack tecnica definida: Next.js, NestJS, PostgreSQL, Prisma e BullMQ/Redis. O modelo fisico ja tem fundacao inicial no schema Prisma; o detalhamento do modelo continua evoluindo nas proximas fases conforme integracoes e regras reais forem implementadas.

## Arquitetura Pretendida

A arquitetura escolhida sera baseada em:

- Frontend: **Next.js**.
- Backend API: **NestJS**.
- Banco relacional: **PostgreSQL**.
- ORM/camada de acesso a dados: **Prisma**.
- Filas/jobs: **BullMQ com Redis**.

O sistema provavelmente precisara de:

- Frontend web para o painel SaaS.
- Backend API para autenticacao, dados, integracoes e regras de negocio.
- Banco de dados relacional para usuarios, leads, campanhas, eventos e configuracoes.
- Jobs/filas para sincronizar Meta Ads, processar webhooks, recalcular metricas e enviar eventos.
- Webhooks para WhatsApp e Meta.
- Camada de seguranca para tokens, secrets e permissoes.
- Observabilidade basica para erros de integracao e falhas de envio.
- Integracao com Asaas para assinaturas, cobrancas, status de pagamento, NF e split.
- Integracao Asaas deve ser feita pelo backend, nunca diretamente pelo frontend com credenciais sensiveis.
- Frontend solicita criacao/upgrade de instancia; backend cria cobranca ou checkout no Asaas e retorna URL/status para o usuario pagar.
- Webhooks Asaas devem ser idempotentes e usados como fonte de confirmacao para ativar instancias e atualizar status de assinatura.
- Backoffice interno da plataforma deve permitir configurar split Asaas sem expor essa area para clientes finais.
- Backend deve armazenar logs estruturados de webhooks, jobs, respostas externas e eventos criticos para alimentar a Central de Diagnostico.

Direcao de deploy confirmada:

- Next.js na Vercel.
- NestJS API em VPS/Dokploy.
- PostgreSQL em VPS/Dokploy ou servico gerenciado a decidir na implementacao.
- Redis/BullMQ em VPS/Dokploy ou servico gerenciado a decidir na implementacao.
- Workers NestJS/BullMQ no mesmo ambiente do backend.
- Webhooks externos devem apontar para a API publica do backend.

## Design System

Base visual: `wpptrack-design-system/`.

Caracteristicas importantes:

- Cor primaria: teal/petroleo `#0E8C7A`.
- Acento de sinal/evento: mint `#12B884`.
- Neutros grafite frios.
- Tipografia:
  - Display: Space Grotesk.
  - Corpo/UI: Hanken Grotesk.
  - Dados/IDs/metricas: JetBrains Mono.
- UI B2B SaaS densa, clara e orientada a dados.
- Evitar visual de WhatsApp puro, verde dominante, chatbot generico ou automacao de disparos.
- O Markdown de metricas solicita marca d'agua fixa no painel: "desenvolvido por Comunidade NOD - PalmUP - Dericson Calari e Samuel Choairy".
- Essa marca d'agua deve ser tratada como ponto a confirmar antes da implementacao visual final, porque afeta a experiencia do cliente final e possivelmente planos white-label.

## Brainstorming e Execucao Atual

O brainstorming inicial ja definiu a direcao de produto, arquitetura e implementacao da Fase 1.

Checkpoint atual:

- Contexto explorado.
- Visual companion tentou rodar em `52341`, mas caiu por timeout no Windows.
- Alternativa estavel criada: `wpptrack-saas-visual.html` servida por `http://127.0.0.1:5174/wpptrack-saas-visual.html`.
- Usuario selecionou a opcao B: relatorios fortes desde o inicio.
- Estrategia de execucao da Fase 1 selecionada: subagent-driven development.
- Tasks 1-9 da Fase 1 implementadas, verificadas no que nao depende de Docker local e commitadas.
- Rodada Paralela 1 aprovada e executada com agentes em trilhas separadas: Visual, Auth/Workspaces, Integracoes e Diagnosticos/Logs.
- Docker Desktop validado localmente com PostgreSQL e Redis ativos. Migrations aplicadas ate `20260702123000_leads`.
- API agora possui readiness real em `/health/ready`, script de start de producao e modulo global de runtime para `process.env`/`fetch`.
- Leads persistentes iniciados: modelo `Lead`, contratos compartilhados, `GET /leads`, upsert via webhook Uazapi e tela `Leads` consumindo backend com estados reais/vazio/erro sem fallback demonstrativo.
- Tela de `Integracoes` agora consulta `GET /billing/whatsapp-instance/quote` e possui formulario real para adicionar instancia WhatsApp via `POST /billing/whatsapp-instance/checkout`; a liberacao continua dependente do pagamento confirmado pelo webhook Asaas.
- Tela de `Configuracoes` agora possui CRUD visual inicial para regras de conversao: cria regras por palavra-chave/etiqueta via `POST /conversion-rules` e pausa/ativa regras via `PATCH /conversion-rules/:id`, sem fallback demonstrativo quando a API falha ou retorna vazia.
- Idempotencia inicial implementada: `WebhookLog.idempotencyKey` e `ConversionEventLog.dedupeKey` sao unicos no banco. Webhooks Uazapi duplicados retornam `duplicate` sem reavaliar regras, recriar lead ou enfileirar novo envio Meta; conversoes duplicadas retornam em `duplicates` sem novo log.
- Central de Diagnostico recebeu filtros reais no backoffice e no endpoint `GET /backoffice/diagnostics/events`: `q`, `since`, `until`, `workspaceId`, `source`, `severity`, `status`, `eventType`, `leadId`, `phoneHash`, `campaignId`, `adSetId`, `adId` e `errorCode`.
- Relatorios removeram as campanhas demo fixas da tabela quando ha resposta da API e agora contam conversas reais a partir de leads persistidos por campanha/periodo.
- Visao Geral foi conectada ao endpoint real de relatorios e passou a agregar os resultados do backend, mantendo fallback somente quando a API nao responde.
- Overview/Reports agora mostram estado vazio real sem cair em mock; falha de API mostra `API indisponivel` e nao injeta dados de demonstracao. O mock web de reporting foi removido.
- Leads agora mostra estado vazio real ou `API indisponivel` sem renderizar pessoas/campanhas ficticias quando a API retorna vazia ou falha.
- Configuracoes agora mostra estado vazio real ou `API indisponivel` para regras de conversao sem renderizar regras ficticias.
- Backoffice agora removeu MRR/workspaces/alertas/tokens ficticios, recebedor Asaas de fallback e linhas demonstrativas da Central de Diagnostico; estados vazios e falhas de API ficam explicitos.
- Integracoes agora salva a selecao Meta BM/conta/pixel por formulario server-side, sem expor token e sem botao falso.

Proximo passo operacional:

- Continuar a proxima rodada com: reduzir fallbacks restantes em Integracoes e evoluir relatorios por conjunto/anuncio.

## Perguntas Abertas

1. Definir dominios finais de app/API e decidir se PostgreSQL/Redis ficarao no Dokploy ou em servicos gerenciados.
2. Detalhar seguranca da autenticacao propria: hash de senha, refresh tokens/sessoes, recuperacao de senha, verificacao de email e Google OAuth.
3. Mapear contrato tecnico da Uazapi e definir o adapter WhatsApp inicial.
4. Validar detalhes do app Meta existente: app id, permissoes, produtos ativos, URLs de callback, modo live/dev e limites.
5. Quais metricas de trafego sao obrigatorias na primeira versao robusta?
6. Confirmar formulas finais das metricas de funil: conversas Meta, conversa real, LeadSubmitted, QualifiedLead, Purchase e custos por etapa.
7. Confirmar se a marca d'agua fixa deve aparecer para todos os clientes, somente em planos especificos ou ficar fora do SaaS final.
8. Detalhar planos por numero de instancias WhatsApp, ciclo de cobranca Asaas, cobranca antecipada de nova instancia, inadimplencia, NF, split percentual e backoffice interno de split.
9. Detalhar convites para membros do workspace e matriz inicial de permissoes para owner/admin/member.
10. Definir quando ativar IA de analise de conversa e quais provedores/modelos usar no futuro.

## Regras para Futuras Conversas

- Leia este `Projeto.md` antes de trabalhar no projeto.
- Nao reintroduzir a camada de agencias/clientes sem decisao explicita do usuario.
- Manter relatorios como area central do produto.
- Manter o design system WppTrack como fonte visual.
- Atualizar este arquivo sempre que houver decisoes importantes de produto, arquitetura, escopo ou implementacao.
