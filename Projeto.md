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
- Google OAuth agora possui fluxo backend real: `POST /auth/google/start` monta a URL de autorizacao com scopes `openid email profile`; `GET /auth/google/callback` troca o `code` em `https://oauth2.googleapis.com/token`, busca perfil em `https://openidconnect.googleapis.com/v1/userinfo`, linka Google a usuario ja existente, abre sessao com cookie `HttpOnly` e redireciona o navegador de volta para o frontend usando `WEB_ORIGIN`.
- Google OAuth agora assina o parametro `state` com HMAC antes de enviar ao Google e valida a assinatura no callback; redirects adulterados ou state legado/invalido voltam para `/overview`. Preferir `GOOGLE_OAUTH_STATE_SECRET` em producao; se ausente, o backend usa `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_SECRET` ou fallback local de desenvolvimento.
- Frontend de login agora possui link funcional `Entrar com Google`: `/login/google` chama o backend `/auth/google/start` e redireciona para o Google quando configurado, ou volta para `/login?error=google_env` quando faltam credenciais. A tela de login tambem exibe mensagens claras para erros de callback Google (`google_env`, `google_exchange`, `google_pending`).
- Decisao operacional em 2026-07-08: cadastro publico deve ficar fechado. Clientes/workspaces devem ser criados pela area interna/operacao da plataforma, nao por qualquer visitante da URL publica. A tela `/login` agora exibe apenas login por email/senha, Google e recuperacao de senha; nao mostra `Criar conta`.
- Backend bloqueia `POST /auth/register` por padrao em producao, exceto se `AUTH_PUBLIC_REGISTRATION_ENABLED=true` for configurado explicitamente. Em desenvolvimento, o endpoint continua aberto se a variavel nao for definida, para facilitar testes locais.
- Google Login nao auto-provisiona mais usuarios/workspaces novos. Ele apenas autentica emails ja existentes ou linka Google a um usuario criado pela plataforma; email desconhecido volta para `/login?error=google_pending`.
- Bug de sessao identificado no deploy split: a API em `wpptrack-api.rastrack.app` gravava cookie apenas no subdominio da API, enquanto o frontend em `wpp.rastrack.app` precisava ler `wpptrack_session` no middleware. A correcao e configurar `AUTH_COOKIE_DOMAIN=.rastrack.app` no backend em producao, fazendo o cookie ser compartilhado entre API e frontend.
- Um bootstrap administrativo foi preparado para criar/atualizar o primeiro usuario master sem reabrir cadastro publico: `pnpm --filter @wpptrack/api platform-admin:create -- --email email@dominio.com --password senha-forte --name "Nome"`. O email tambem precisa estar em `WPPTRACK_PLATFORM_ADMIN_EMAILS` para acessar `/backoffice`.
- Recuperacao de senha e verificacao de email receberam scaffold persistente: `AuthActionToken` no Prisma, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/email/verification/start` e `POST /auth/email/verification/confirm`. Tokens ficam hasheados no banco e so sao retornados em desenvolvimento/controlado com `AUTH_EXPOSE_DEV_TOKENS=true`.
- Tokens de acao de autenticacao agora invalidam tokens ativos anteriores do mesmo usuario/tipo antes de emitir um novo token, dentro de transacao. Isso evita que multiplos links antigos de reset/verificacao continuem validos em paralelo.
- Frontend de recuperacao de senha implementado: `/login/forgot` solicita token via `POST /auth/password/forgot`, `/login/reset?token=...` confirma nova senha via `POST /auth/password/reset`, e o login aponta `Esqueci minha senha` para o fluxo real.
- Frontend de verificacao de email implementado: `Configuracoes` consulta `/auth/me`, mostra status da conta, solicita verificacao via `POST /auth/email/verification/start` e `/login/verify?token=...` confirma via `POST /auth/email/verification/confirm`.
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
- Ao ativar uma instancia paga, o backend agora sincroniza `WorkspaceSubscription`: cria/atualiza assinatura `active`, recalcula `activeInstances` pelo numero real de instancias ativas e permite que o resumo financeiro reflita a nova mensalidade por instancia.
- Webhook Asaas tambem trata falha/inadimplencia da cobranca de instancia: eventos/status como `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, chargeback ou `OVERDUE`/`DELETED`/`REFUNDED` marcam `PaymentCharge` como `failed` e mantem a instancia em `pending_payment`, preservando pagamento antes do uso.
- Webhooks Asaas duplicados agora nao executam efeitos colaterais de billing novamente: quando o `WebhookLog` retorna `duplicate`, o controller devolve `billing: { processed: false, status: "ignored" }` sem chamar ativacao/cobranca.
- Webhook Asaas agora suporta protecao opcional por `ASAAS_WEBHOOK_AUTH_TOKEN`: quando configurado, o backend exige o header oficial `asaas-access-token` antes de gravar diagnostico ou ativar cobranca.
- A criacao real da cobranca no Asaas agora esta plugada ao checkout, mas depende de `ASAAS_BASE_URL`, `ASAAS_API_KEY` e `Workspace.asaasCustomerId`. O backoffice ja possui listagem/tela protegida para configurar o customer Asaas por workspace sem abrir banco ou terminal.
- Webhook Uazapi agora avalia regras de conversao quando recebe `x-workspace-id`: extrai texto de mensagem e etiquetas comuns do payload, executa `/conversion-rules` internamente e cria `ConversionEventLog` para regras encontradas, com status `ready_to_send` quando ha `pixelId` e `adId`, ou `pending_meta_context` quando falta contexto Meta.
- Leads agora persistem etiquetas recebidas nos webhooks Uazapi em `Lead.labels`; `/leads` aceita filtro `label`, a tela `Leads` envia esse filtro e exibe as etiquetas do lead, permitindo auditar conversoes disparadas por etiqueta sem depender de abrir payload bruto.
- Webhook Uazapi agora grava metadados operacionais no `WebhookLog` e no `DiagnosticEvent`: `leadId` quando recebido, `phoneHash` calculado a partir do telefone normalizado quando necessario, `campaignId`, `adSetId` e `adId`. Isso permite correlacionar o detalhe do lead, webhooks recebidos, eventos CAPI e filtros do backoffice sem abrir banco ou payload cru.
- Webhook Uazapi agora tenta resolver `workspaceId` e `whatsappInstanceId` automaticamente pelo `providerInstanceId` recebido no payload (`providerInstanceId`, `instanceId`, `instance_id`, `instance.id`, `instance.instanceId` ou `whatsappInstance.providerInstanceId`). Com isso, webhooks reais da Uazapi podem criar lead/conversao sem depender do header manual `x-workspace-id`.
- Webhook Uazapi agora suporta protecao opcional por `UAZAPI_WEBHOOK_AUTH_TOKEN`; quando configurado, o backend aceita o token por header `x-wpptrack-webhook-token`, `Authorization: Bearer ...` ou query `?token=...` antes de gravar diagnostico/conversao.
- Decisao aprovada em 2026-07-06: Uazapi deve operar com webhook por instancia para evitar mistura operacional entre clientes. O endpoint novo e `POST /webhooks/uazapi/instances/:instanceId`; cada instancia recebe um token proprio gerado pelo backend, enviado para a Uazapi na URL e salvo localmente apenas como hash SHA-256 em `WhatsappInstance.webhookTokenHash`.
- `UAZAPI_WEBHOOK_AUTH_TOKEN` permanece como fallback/global para endpoint legado e operacao administrativa, mas a rota preferencial de producao e por instancia com token proprio.
- Integracao Uazapi/WhatsApp ganhou camada inicial de conexao para instancias pagas: `GET /integrations/whatsapp/instances/:id/status`, `POST /integrations/whatsapp/instances/:id/connect` e `GET /integrations/whatsapp/instances/:id/qr`. O backend valida a sessao/workspace, recusa instancia `pending_payment`, chama a Uazapi apenas server-side e retorna status/QR sanitizado sem expor token.
- Adapter Uazapi alinhado com a documentacao oficial OpenAPI v2.1.1 (`https://docs.uazapi.com/openapi-bundled.json`): usa header `token` em vez de `Authorization: Bearer`, chama `/instance/status` e `/instance/connect` sem ID no path e interpreta payload oficial aninhado em `instance`/`status`.
- Criacao oficial de instancia Uazapi agora acontece depois do pagamento confirmado pelo Asaas: no webhook pago, o backend chama `POST /instance/create` com `UAZAPI_ADMIN_TOKEN`, envia `adminField01=workspaceId` e `adminField02=whatsappInstanceId`, persiste `providerInstanceId` e criptografa o token individual retornado em `WhatsappInstance.providerTokenEncrypted/providerTokenIv/providerTokenTag`.
- Depois de criar a instancia Uazapi, o backend tambem configura automaticamente `/webhook` na Uazapi usando o token individual da instancia, eventos `messages`, `messages_update`, `labels`, `chat_labels` e `connection`, filtro `excludeMessages: ["wasSentByApi"]` e URL `API_PUBLIC_URL/webhooks/uazapi/instances/{id}?token={token-gerado}`. O token em texto nao e persistido.
- Chamadas Uazapi operacionais (`status`, `connect`, `qr` e `labels`) agora usam o token individual da instancia quando existe, descriptografado apenas no backend; `UAZAPI_TOKEN` fica como fallback local/legado. Tokens e QR codes nao devem ser expostos em DTOs, logs ou auditoria.
- Health/start da integracao Uazapi agora considera `UAZAPI_ADMIN_TOKEN` como credencial principal para provisionamento por instancia; `UAZAPI_TOKEN` permanece apenas como fallback legado/local.
- `UAZAPI_ADMIN_TOKEN` foi adicionado ao `.env.example`; sem ele, a ativacao paga continua funcionando localmente, mas registra `IntegrationLog` `uazapi.instance.create` com status `blocked` para diagnostico.
- Etiquetas Uazapi ganharam contrato/backend inicial: `GET /integrations/whatsapp/instances/:id/labels` valida workspace e instancia ativa, chama `/labels` na Uazapi server-side, retorna DTO sanitizado (`id`, `name`, `colorHex`, `labelId`) e registra `IntegrationLog` `uazapi.labels.list`.
- Solicitacoes de conexao WhatsApp via `POST /integrations/whatsapp/instances/:id/connect` agora geram `AuditLog` `whatsapp_instance.connect_requested` com ator usuario, status retornado pela Uazapi e resumo seguro antes/depois do `providerInstanceId`, sem expor QR code nem id bruto do provider no log de auditoria.
- A API tambem lista instancias WhatsApp do workspace em `GET /integrations/whatsapp/instances`; a aba `Integracoes` consome essa lista, mostra nome/status de pagamento/id Uazapi e oferece acao server-side para conectar instancias ativas.
- `WhatsappInstance` agora possui `providerInstanceId` para mapear a instancia local ao identificador criado/retornado pelo provider Uazapi; migration `20260702095000_whatsapp_provider_instance` adiciona esse campo e indice.
- Verificacao da fatia Uazapi: `pnpm test`, `pnpm typecheck`, `pnpm build` e `prisma validate` passaram. `prisma migrate deploy/status` ficou pendente localmente porque o Docker Desktop/engine nao estava acessivel (`dockerDesktopLinuxEngine` indisponivel), mas a migration esta versionada.
- Envio Meta CAPI recebeu adapter plugavel: `MetaCapiAdapter` envia eventos para `/{PIXEL_ID}/events` usando `META_CAPI_ACCESS_TOKEN` e `META_GRAPH_API_VERSION`; `ConversionEventsService.sendReadyEvent` pega logs `ready_to_send`, envia para a Meta quando possivel e atualiza `ConversionEventLog` para `sent`, `error` ou `not_configured` com resposta resumida.
- Envio Meta CAPI agora tenta usar token CAPI criptografado por workspace em `MetaIntegration` (`capiAccessTokenEncrypted`, `capiTokenIv`, `capiTokenTag`) antes de cair no token global de ambiente, preparando credenciais Pixel por cliente sem expor segredo em logs. Migration local aplicada: `20260702193000_meta_capi_workspace_token`.
- Historico tecnico: existe endpoint interno legado `PUT /integrations/meta/capi-token` para salvar/limpar token CAPI por workspace, com criptografia e auditoria sem expor segredo. Decisao operacional atual: o usuario final **nao deve ver nem preencher token manual** na aba `Integracoes`; a conexao Meta OAuth gera e guarda o access token no backend, e o envio Pixel/CAPI deve usar esse token criptografado quando nao houver token legado configurado.
- OAuth Meta real avancou no backend: `GET /integrations/meta/start` agora monta a URL oficial de autorizacao da Meta com `META_APP_ID`, `META_OAUTH_REDIRECT_URL`, `META_GRAPH_API_VERSION` e `META_OAUTH_SCOPES`; `GET /integrations/meta/callback` valida `code/state`, troca o code no Graph `/oauth/access_token` server-side com `META_APP_SECRET` e retorna somente metadados sanitizados, sem expor access token ao frontend.
- Para o login social/OAuth Meta, nao ha configuracao de webhook nesta etapa: o requisito humano no painel da Meta e cadastrar exatamente a URL de redirecionamento `API_PUBLIC_URL/integrations/meta/callback`. Webhook Meta fica separado para eventos futuros, como leadgen/challenge, e usa `/webhooks/meta`.
- Persistencia segura do OAuth Meta por workspace implementada: `MetaIntegration` armazena access token criptografado com AES-256-GCM usando `META_TOKEN_ENCRYPTION_KEY`, scopes, expiracao, status e selecoes futuras de BM/conta/pixel. O callback OAuth usa `state` assinado para identificar o workspace, salva a conexao e retorna apenas DTO sanitizado. A aba `Integracoes` consulta `GET /integrations/meta/connection`, mas nao deve exibir escopos ou tokens para o cliente.
- O OAuth Meta deve ser persistente para o cliente: apos o callback, o backend troca o token curto por token de longa duracao via `grant_type=fb_exchange_token`, salva somente o token longo criptografado e usa esse token nas leituras de BM/conta/Pixel e no envio Pixel/CAPI. O usuario nao deve precisar reconectar ao atualizar pagina, sair e voltar; reconexao so deve ser necessaria quando o token expirar/revogar ou quando ele quiser trocar a conta Meta.
- Primeira camada de ativos Meta implementada: `GET /integrations/meta/assets` usa o token OAuth criptografado/descriptografado apenas no backend para buscar `businesses`, `owned_ad_accounts` e `adspixels` no Graph API; `PUT /integrations/meta/assets/selection` salva BM, conta de anuncio e Pixel selecionados no `MetaIntegration`. A aba `Integracoes` mostra BM/conta/pixel selecionados e estados humanos de conexao/sincronizacao. Sincronizacao persistente de campanhas/conjuntos/anuncios e metricas ainda fica para a proxima onda Meta.
- Ajuste Meta aprovado em 2026-07-09: contas de anuncio e Pixels devem ser carregados com `businessId` e filtrados pelo BM selecionado na UI. Ao selecionar um BM, a conta de anuncio e o Pixel exibidos pertencem apenas a esse BM; sem BM selecionado, nao se deve misturar ativos de varios BMs. O backend agora busca contas por `/{businessId}/owned_ad_accounts`, Pixels por `/{businessId}/adspixels` e segue `paging.next` do Graph API para nao limitar a primeira pagina.
- Ajuste Meta aprovado em 2026-07-09: o campo `code`/`Facebook Pixel Code` de `adspixels` nao e dado operacional para o cliente e nao deve ser pedido ao Graph nem exibido na UI. A selecao de Pixel usa apenas id/nome e o token OAuth criptografado do backend.
- Ajuste de performance Meta aprovado em 2026-07-09: `/integrations/meta/assets` nao deve fazer fan-out por todos os BMs do usuario ao abrir a aba `Integracoes`. O endpoint lista os BMs e so busca contas de anuncio/Pixels do BM selecionado, evitando dezenas de chamadas ao Graph API em contas com muitos BMs.
- Ajuste UX Meta aprovado em 2026-07-09: ao trocar o BM no formulario de `Integracoes`, o frontend deve carregar contas de anuncio e Pixels daquele BM sob demanda via `/integrations/meta/assets?businessId=...`, sem exigir reconexao Meta e sem salvar selecao parcial antes de listar os ativos.
- Ajuste de performance Meta implementado em 2026-07-09: `MetaAssetSnapshot` persiste snapshots de BMs e ativos por BM. `GET /integrations/meta/assets` virou leitura rapida do banco e nao chama mais Meta Graph no carregamento normal da aba. `POST /integrations/meta/assets/refresh` e o caminho que chama Meta Graph, atualiza snapshot, audita `meta.assets.snapshot_refreshed` e retorna os ativos atualizados. O frontend tem botao `Atualizar ativos Meta` e os seletores por BM usam o refresh sob demanda para popular contas, Pixels e paginas.
- Ajuste Meta aprovado em 2026-07-09: Paginas Facebook tambem devem ser filtradas pelo BM selecionado, usando `/{businessId}/owned_pages` e `/{businessId}/client_pages`. Nao usar `/me/accounts` como fonte do seletor final, porque mistura todas as paginas em que o usuario e administrador e permite selecionar pagina fora do BM.
- Ajuste UX Meta aprovado em 2026-07-09: o formulario `Contas para relatorios` tambem deve carregar contas de anuncio sob demanda ao trocar BM, usando `/integrations/meta/assets?businessId=...`. O salvamento de uma conta de relatorio deve validar a conta contra o mesmo BM informado, evitando adicionar conta de outro BM por engano.
- Spec Meta multi-conta aprovada em 2026-07-09: `docs/superpowers/specs/2026-07-09-wpptrack-meta-multi-account-whatsapp-campaigns-design.md`. A selecao unica `selectedBusinessId`/`selectedAdAccountId`/`selectedPixelId` passa a ser legado conceitual. O novo desenho separa `MetaConversionDestination` unico por workspace (Pixel principal + Pagina Facebook principal/page_id para CAPI) de `MetaReportingAccount` multiplo por workspace (BM + conta de anuncio para relatorios). Relatorios devem consolidar todas as contas ativas por padrao e permitir filtros por BM/conta.
- Implementacao Meta multi-conta executada em 2026-07-09 a partir do plano `docs/superpowers/plans/2026-07-09-wpptrack-meta-multi-account-whatsapp-campaigns-implementation.md`: workspaces agora possuem destino de conversao unico (Pixel + Pagina/page_id) e multiplas contas de anuncio ativas para relatorios. Relatorios consolidam as contas ativas por padrao, aceitam filtro por BM/conta e contam campanhas WhatsApp por classificacao automatica/manual.
- Campanhas WhatsApp aprovadas em 2026-07-09: nao filtrar por resultado/conversas iniciadas. Detectar campanhas, conjuntos e anuncios de WhatsApp por `destination_type` do Ad Set, creative/CTA (`WHATSAPP_MESSAGE`) e evidencia real de leads WhatsApp recebidos. Manter revisao manual com `manual_include`/`manual_exclude`, e por padrao contar nos relatorios apenas itens classificados como WhatsApp.
- Aba `Integracoes` agora possui formulario real para salvar selecao Meta BM/conta/pixel via `PUT /integrations/meta/assets/selection`; os botoes placebo de selecionar foram substituidos por leitura do ativo selecionado.
- Ajuste visual executado em 2026-07-08: telas do app web receberam uma passada de densidade/responsividade para corrigir tipografia gigante em cards, selects/inputs desalinhados, grids estourando container e scroll horizontal do documento. Validacao headless em `/integrations`, `/reports` e `/settings` confirmou `horizontalOverflow=false` e nenhum elemento escapando em viewport 1240x900.
- Aba `Integracoes` agora exibe CTA principal de OAuth Meta/Facebook (`Conectar com Facebook/Meta` ou `Reconectar Meta`) antes dos cards de status. O fluxo foi alinhado ao R100 Wpp: o frontend chama `/integrations/meta/start`, abre a URL oficial do Facebook em popup centralizado, recebe `postMessage` do callback e atualiza a tela sem redirecionar a pagina inteira. Token CAPI permanece como configuracao avancada separada.
- Escopos Meta OAuth padrao seguem o app R100 Wpp funcional: `ads_read`, `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`. Nao usar `read_insights`, porque a Meta rejeita esse escopo no Facebook Login usado aqui.
- Aba `Integracoes` agora diferencia estados carregados/vazios/indisponiveis para health, WhatsApp, Meta e quote de cobranca; nao renderiza mais provedores fallback locais, texto `Fallback visual` ou metricas ficticias no pipeline de sinal.
- Aba `Integracoes` agora busca `GET /integrations/whatsapp/instances/:id/status` para instancias WhatsApp ativas, renderiza status de conexao, mensagem do provider e QR retornado pela Uazapi quando `connectionStatus=qr_required`; a acao `Conectar WhatsApp` revalida a tela depois do POST.
- Pipeline de sinal em `Integracoes` agora usa `GET /integrations/pipeline` em vez de textos estaticos: o backend resume os ultimos 7 dias por workspace com contadores reais de leads CTWA, webhooks Uazapi, leads rastreados, eventos CAPI prontos e eventos enviados para Meta.
- Primeira camada de reporting Meta persistente implementada: novos snapshots `MetaCampaign`, `MetaAdSet` e `MetaAd` guardam campanhas, conjuntos e anuncios por workspace/conta selecionada. `POST /reports/meta/sync` agora enfileira a sincronizacao na fila BullMQ `meta-report-sync`; o worker `MetaReportSyncProcessor` busca campanhas/adsets/ads/insights no Graph API usando o token OAuth somente no backend e persiste investimento, impressoes, cliques e conversas Meta por campanha, conjunto e anuncio. `GET /reports/campaigns` monta `ReportOverviewDto` cruzando snapshots Meta com `ConversionEventLog` interno para `LeadSubmitted`, `QualifiedLead` e `Purchase`. A tela `Relatorios` tenta ler esse endpoint real, mostra estados vazio/erro sem dados demonstrativos e possui botao `Sincronizar Meta`.
- Estrutura Meta detalhada em relatorios implementada: `GET /reports/meta/structure` retorna campanhas com conjuntos e anuncios a partir dos snapshots `MetaCampaign`, `MetaAdSet` e `MetaAd`. A tela `Relatorios` usa essa estrutura como diagnostico tecnico recolhido, nao como tabela principal de performance, permitindo inspecionar se a sincronizacao trouxe a hierarquia usada nos relatorios sem gerar scroll infinito na pagina.
- Filtros de periodo iniciais em `Relatorios` implementados: a tela aceita `since` e `until` na query string, renderiza inputs de data e envia os mesmos filtros para `GET /reports/campaigns` e para o enqueue `POST /reports/meta/sync`. No backend, o range vira `rangeLabel` e filtra eventos internos (`ConversionEventLog.createdAt`) quando ambos os campos estao presentes.
- Relatorios agora calculam `realConversations` a partir de `Lead` por campanha e periodo, com `costPerRealConversationCents`. A tela `Relatorios` deixou de injetar campanhas demo fixas e nao renderiza campanha ou metrica ficticia quando o backend nao responde.
- Relatorios por conjunto e anuncio implementados: `GET /reports/adsets` e `GET /reports/ads` usam snapshots `MetaAdSet`/`MetaAd`, insights Meta por `level=adset` e `level=ad`, `Lead.adSetId`/`Lead.adId` e `ConversionEventLog.adSetId`/`ConversionEventLog.adId` para mostrar investimento, conversas Meta, conversas reais, `LeadSubmitted`, `QualifiedLead`, `Purchase` e custos por nivel sem estimativa proporcional falsa.
- Relatorios agora possuem comparacao entre periodos na UI: quando `compareSince` e `compareUntil` sao enviados na query string, a tela busca um segundo recorte em `GET /reports/campaigns`, agrega investimento, conversas Meta, conversas reais, `LeadSubmitted`, `QualifiedLead` e `Purchase`, e exibe delta percentual contra o periodo atual sem inventar dados quando nao ha base comparativa.
- Exportacao inicial de relatorios implementada: `GET /reports/campaigns/export.csv` gera CSV server-side com campanhas e metricas agregadas do recorte atual; o frontend expoe `/reports/export` como proxy autenticado e a tela `Relatorios` mostra `Exportar CSV`, preservando `since`/`until` e sem incluir dados pessoais de leads.
- Visao Geral agora consome `GET /reports/campaigns`, agrega todas as campanhas retornadas pela API para KPIs e funil, lista campanhas do recorte e troca os indicadores hardcoded de qualidade por taxas derivadas dos dados. Quando a API nao responde, mostra estado indisponivel sem KPIs/campanhas ficticias.
- Visao Geral e Relatorios agora diferenciam estados `real`, `empty` e `error`: resposta real vazia exibe estado vazio sem dados demo; falha de API exibe estado indisponivel sem renderizar campanha ou metricas ficticias.
- Leads agora diferencia estados `real`, `empty` e `error`: resposta real vazia exibe estado vazio; falha de API mostra `API indisponivel`; a tela nao injeta mais leads/campanhas demonstrativos como fallback.
- Detalhe de lead implementado em `GET /leads/:id` e `/leads/[leadId]`: a pagina mostra dados do lead, atribuicao Meta resolvida, eventos de conversao/CAPI e webhooks Uazapi vinculados por `leadId` ou `phoneHash`, sem dados ficticios quando a API falha.
- Drill-down de relatorios para leads implementado: linhas de campanha, conjunto e anuncio em `Relatorios` apontam para `/leads` com `campaignId`, `adSetId`, `adId`, `since` e `until`; `GET /leads` aceita esses filtros e usa `Lead.createdAt` para o recorte de periodo, permitindo sair da performance para a lista real de conversas/leads sem depender de credenciais externas.
- Configuracoes agora diferencia estados `real`, `empty` e `error` para regras de conversao: resposta vazia orienta criar regra; falha de API mostra `API indisponivel`; a tela nao injeta mais regras demonstrativas.
- Configuracoes agora tambem consome `GET/PATCH /workspaces/current`, `GET /workspaces/current/members` e `GET /workspaces/current/invites`, exibindo e salvando nome do workspace, slug/papel, membros reais, convites pendentes e formulario de convite via `POST /workspaces/current/invites`, sem usuarios ficticios. A rota `/settings/invites/accept?token=...` permite aceitar convite autenticado com o email convidado via `POST /workspaces/invites/accept`.
- Permissoes iniciais por papel agora protegem acoes sensiveis: `member` permanece leitura/operacao basica, mas nao pode criar checkout de instancia WhatsApp, conectar WhatsApp, iniciar OAuth Meta, alterar selecao BM/conta/pixel, criar/editar regras de conversao ou reenfileirar sincronizacao Meta; essas acoes ficam com `owner/admin` conforme o caso, e cobranca de instancia exige `owner`.
- Frontend de cliente agora reflete as permissoes do workspace: `member` continua vendo relatorios, regras, Meta e instancias, mas nao recebe formularios/botoes para sincronizar Meta, alterar selecao BM/conta/pixel, criar/pausar regras, adicionar instancia paga ou conectar WhatsApp. Acoes sensiveis seguem protegidas tambem no backend.
- Modulo mock legado da API removido: a rota `GET /mock/reports/overview` e os dados demonstrativos `workspace_demo`/`cmp_black_friday` nao ficam mais registrados no `AppModule`; teste estrutural protege contra retorno de `MockController`/`MockService`.
- Backoffice de split recebeu API inicial: `GET /backoffice/split/receivers`, `POST /backoffice/split/receivers` e `PATCH /backoffice/split/receivers/:id`, usando `SplitReceiver` para nome, wallet Asaas, email, percentual em basis points e status ativo.
- Criacao/edicao de recebedores de split Asaas agora gera `AuditLog` operacional (`split_receiver.created` e `split_receiver.updated`) com ator `platform_operator`, alvo `SplitReceiver`, status ativo/pausado e resumo seguro com hashes de wallet/email, sem expor credenciais ou dados sensiveis crus.
- Tela de backoffice agora consulta `/backoffice/split/receivers`, exibe recebedores e permite criar/editar nome, wallet Asaas, email, percentual e status ativo/pausado via frontend; quando a API falha ou retorna vazia, mostra estado vazio/indisponivel sem recebedor demonstrativo.
- Tela de backoffice agora exibe acao de `Reprocessar` para eventos reais da Central de Diagnostico; a acao chama o retry auditado `POST /backoffice/diagnostics/events/:id/retry` via server action e mostra estado vazio/indisponivel sem linhas demonstrativas quando nao ha eventos reais.
- Cards do backoffice agora usam apenas contagens derivadas dos endpoints carregados (`workspaces/billing`, `split/receivers`, `diagnostics/events`) e nao exibem mais MRR, volume de workspaces, alertas, jobs ou tokens ficticios.
- Central de Diagnostico ganhou pagina de detalhe em `/backoffice/diagnostics/:eventId`, consumindo `GET /backoffice/diagnostics/events/:id`, exibindo metadados, payload sanitizado e acao auditada de `Reprocessar evento`. A listagem do backoffice agora aponta cada evento para essa pagina.
- Detalhe da Central de Diagnostico agora retorna e renderiza `timeline` operacional com o proprio evento, webhook relacionado, auditorias de retry e tentativas de job vinculadas ao diagnostico. A meta e permitir investigacao pelo frontend interno sem abrir banco, preservando payloads sanitizados.
- Timeline do detalhe diagnostico agora tambem inclui chamadas externas (`IntegrationLog`) e eventos Pixel/CAPI (`ConversionEventLog`) vinculados ao evento, mostrando request id, duracao, pixel/campanha/anuncio e erro/status resumidos para rastrear a cadeia webhook -> conversao -> chamada externa.
- Timeline do detalhe diagnostico tambem correlaciona tentativas de job gravadas diretamente no `ConversionEventLog`, entao falhas/sucessos reais do worker `conversion-events` aparecem no detalhe do diagnostico mesmo quando o `JobAttempt` nao esta ligado diretamente ao `DiagnosticEvent`.
- Reprocessamento da Central de Diagnostico ganhou primeiro caminho real por worker: `POST /backoffice/diagnostics/events/:id/retry` continua criando `AuditLog` e `JobAttempt`, mas agora tambem enfileira `retry-diagnostic-event` na fila `diagnostic-events`. O `DiagnosticProcessor` reenvia conversoes vinculadas a `ConversionEventLog` via `ConversionEventsService.sendReadyEvent`; diagnosticos sem alvo reprocessavel sao pulados com motivo seguro, sem chamar provedores externos cegamente.
- Acoes de `Reprocessar` no backoffice e no detalhe do diagnostico agora revalidam `/backoffice` e `/backoffice/diagnostics/:eventId` apos POST bem-sucedido, para a lista/timeline refletirem auditoria e jobs recentes sem depender de refresh manual.
- O detalhe da Central de Diagnostico tambem exibe `Reprocessar Pixel` nos itens de timeline do tipo `conversion_event_log`, usando o retry direto de `ConversionEventLog` e revalidando o proprio detalhe apos sucesso.
- Autenticacao propria recebeu hardening inicial: login por email agora registra `AuditLog` para sucesso e falha, logout tambem registra auditoria, falhas nao armazenam senha nem email cru e o backend bloqueia temporariamente novas tentativas apos 5 falhas recentes por identidade/IP. A Central de Diagnostico ganhou `GET /backoffice/diagnostics/audit` e a tabela `Auditoria operacional` no backoffice para investigar logins, logouts, retries e acoes administrativas sem abrir banco.
- Reset de senha agora tambem revoga todas as sessoes ativas do usuario e registra `AuditLog` `auth.password_reset_confirmed` com a quantidade de sessoes revogadas, reduzindo risco de sessao antiga permanecer valida apos recuperacao de conta.
- Solicitacao de recuperacao de senha agora registra `AuditLog` `auth.password_reset_requested` sem armazenar email cru e aplica limite temporario por identidade/IP antes de criar novos tokens, mantendo resposta generica para nao revelar se o email existe.
- Workers de diagnostico e envio Pixel/CAPI agora registram `JobAttempt` real a cada execucao: sucesso/status retornado (`sent`, `error`, `skipped` etc.), falhas com `failed` e mensagem de erro, tentativa BullMQ, fila, job, entidade relacionada e payload resumido. Assim a tabela `Jobs operacionais` reflete o que o worker realmente executou, nao apenas o enqueue inicial.
- Central de Diagnostico agora possui filtros reais de investigacao no contrato, API e backoffice: busca textual (`q`), periodo (`since`/`until`), workspace, origem, severidade, status, tipo de evento, lead, telefone hash, campanha, conjunto, anuncio e codigo de erro.
- Central de Diagnostico agora tambem lista webhooks recebidos em `GET /backoffice/diagnostics/webhooks` e renderiza `Webhooks recebidos` no backoffice, com origem, tipo de evento, evento externo, lead/telefone, campanha/anuncio, data de recebimento e status/erro para debug rapido sem abrir banco; a listagem respeita os filtros operacionais compativeis da Central.
- Central de Diagnostico agora lista jobs/tentativas operacionais em `GET /backoffice/diagnostics/jobs` e renderiza `Jobs operacionais` no backoffice, mostrando fila, job, entidade relacionada, tentativa, proximo retry e erro/status para investigar workers e retries sem abrir terminal.
- A tabela `Jobs operacionais` do backoffice agora respeita os filtros da Central de Diagnostico (`workspaceId`, origem, status, busca, periodo) e tambem possui filtros especificos de `queueName` e `jobName`, permitindo investigar filas e workers sem abrir logs do servidor.
- Central de Diagnostico agora lista chamadas externas em `GET /backoffice/diagnostics/integrations` e renderiza `Chamadas externas` no backoffice, exibindo operacao, provider, http status, request id, duracao, atribuicao e erro/status para investigar Meta, Uazapi e Asaas sem abrir logs do servidor.
- Central de Diagnostico agora lista eventos Pixel/CAPI em `GET /backoffice/diagnostics/conversions` e renderiza `Eventos Pixel/CAPI` no backoffice, com evento, gatilho, lead/telefone, pixel, atribuicao, envio e erro/status para investigar conversoes enviadas ou bloqueadas sem abrir banco.
- Central de Diagnostico agora possui retry direto para eventos Pixel/CAPI: `POST /backoffice/diagnostics/conversions/:id/retry` valida motivo, audita `diagnostic.conversion_retry_requested`, recoloca o `ConversionEventLog` como `ready_to_send`, cria `JobAttempt` na fila `conversion-events` e gera `DiagnosticEvent` `conversion.retry_requested` para a timeline operacional.
- A tabela `Eventos Pixel/CAPI` do backoffice agora possui acao `Reprocessar Pixel`, chamando o retry direto de `ConversionEventLog` e revalidando `/backoffice` apos sucesso para atualizar status, auditoria e jobs.
- Webhooks recebidos agora possuem visualizacao auditada de payload sanitizado: `GET /backoffice/diagnostics/webhooks/:id/payload` retorna o resumo redigido do webhook, cria `AuditLog` `diagnostic.webhook_payload_viewed` com operador/IP e a tabela do backoffice aponta para `/backoffice/webhooks/:id/payload`.
- Filtros do backoffice para chamadas externas e eventos Pixel/CAPI agora expoem campos especificos ja suportados pela API: `jobId` para chamadas externas e `sourceTrigger`/`pixelId` para conversoes.
- Chamadas Uazapi de instancia WhatsApp (`status`, `connect` e `qr`) agora registram `IntegrationLog` com operacao, status, duracao, instancia local/provider e resumo sem QR/token, alimentando a tabela `Chamadas externas` para debug de conexao WhatsApp sem abrir logs do servidor.
- Envios Meta Pixel/CAPI executados por `ConversionEventsService.sendReadyEvent` agora tambem registram `IntegrationLog` `meta.capi.send_event` com duracao, status, lead/campanha/conjunto/anuncio, job/conversao vinculada e resposta resumida, permitindo investigar a chamada externa na Central de Diagnostico alem do `ConversionEventLog`.
- Envios Meta Pixel/CAPI bloqueados ou com erro agora tambem geram `DiagnosticEvent` `meta.capi.send_event`, vinculado ao `IntegrationLog` e ao `ConversionEventLog`, com severidade `warning` para configuracao ausente e `error` para falha real.
- Jobs da fila de envio Pixel/CAPI agora preservam `workspaceId` nos `JobAttempt`, usando o workspace retornado por `ConversionEventsService.sendReadyEvent`, permitindo filtrar tentativas de worker por cliente na Central de Diagnostico.
- Sincronizacao de estrutura/relatorios Meta agora registra `IntegrationLog` e `DiagnosticEvent` `meta.reporting.sync` em sucesso e erro, com conta de anuncio, periodo, contadores sincronizados ou erro resumido, sem gravar access token.
- Conexao Meta OAuth e selecao de ativos Meta agora geram `AuditLog`: `meta.oauth.connected` e `meta.assets.selection_updated`, com `targetType: MetaIntegration`, workspace alvo, usuario quando disponivel e resumos sanitizados sem token.
- Webhook Meta agora extrai payloads `leadgen` em `entry[].changes[]`, gravando `eventType: meta.leadgen`, `externalEventId` pelo `leadgen_id` e campos `campaignId`, `adSetId` e `adId` no `WebhookLog`, melhorando atribuicao e debug no backoffice.
- Criacao e edicao de regras de conversao por palavra-chave ou etiqueta WhatsApp agora geram `AuditLog` (`conversion_rule.created` e `conversion_rule.updated`) com workspace, usuario, status ativo/inativo e resumo sanitizado da regra.
- Tentativas de criacao de cobranca Asaas no checkout de instancia WhatsApp agora registram `IntegrationLog` `asaas.payment.create`, incluindo status `success`/`blocked`, duracao, charge local, instancia, valor, split configurado e resposta resumida sem credenciais.
- Webhook Asaas de pagamento agora tambem registra auditoria operacional: pagamento confirmado gera `billing.payment_confirmed`, liberacao da instancia gera `billing.whatsapp_instance_activated` e falha/inadimplencia gera `billing.payment_failed`, todos com ator `system` e resumo antes/depois.
- Convites de workspace agora entram na auditoria operacional: criacao gera `workspace.invite_created` e aceite gera `workspace.invite_accepted`, com ator `user`, workspace/convite alvo e resumos sem token, hash do token ou email cru.
- Mutacoes restantes de workspace agora tambem entram na auditoria: atualizacao de perfil gera `workspace.profile_updated`, convite expirado gera `workspace.invite_expired` e a criacao inicial de workspace/membro owner no cadastro ou primeiro login Google gera `workspace.created` e `workspace.member_added`.
- Docker Desktop foi reiniciado pelo Codex em 2026-07-02 quando a distro WSL `docker-desktop` estava parada e o pipe `dockerDesktopLinuxEngine` ausente. Apos iniciar o Desktop, `docker compose ps` mostrou Postgres/Redis `Up` com portas `5432` e `6379` publicadas; `prisma migrate deploy` aplicou as migrations pendentes `20260702095000_whatsapp_provider_instance`, `20260702103000_meta_integration` e `20260702110000_meta_reporting_snapshots`; `prisma migrate status` confirmou banco atualizado.
- Base de deploy Vercel + Dokploy documentada em `docs/deploy/vercel-dokploy.md`: topologia, variaveis, healthchecks, ordem de deploy, callbacks e validacao pos-deploy. A API tambem ganhou `GET /health/ready`, que valida PostgreSQL e Redis e retorna `503` quando alguma dependencia essencial falha, alem do script `pnpm --filter @wpptrack/api start` para runtime em producao.
- Endpoints internos de backoffice agora exigem sessao valida e allowlist `WPPTRACK_PLATFORM_ADMIN_EMAILS`; usuarios autenticados fora da allowlist recebem acesso negado. As paginas server-side usam `serverApiFetch` para repassar cookie ao backend.
- Backoffice de workspaces ganhou configuracao operacional de billing: `GET /backoffice/workspaces/billing` lista workspaces com `asaasCustomerId`; `GET/PATCH /backoffice/workspaces/:workspaceId/billing` permite visualizar/atualizar o customer Asaas, necessario para criar cobrancas reais no Asaas sem abrir o banco. A tela interna de backoffice ja renderiza essa lista e salva alteracoes por server action.
- Atualizacoes do customer Asaas no backoffice agora geram `AuditLog` `workspace.billing_updated` com ator `platform_operator`, antes/depois indicando se o customer esta configurado e hash do `asaasCustomerId`, sem expor o identificador cru nos logs.
- Backoffice de workspaces agora tambem expoe `subscriptionStatus` e `activeInstances` em `WorkspaceBillingDto`, permitindo ver status da assinatura e quantidade de instancias ativas por workspace diretamente na area interna.
- Backoffice de workspaces agora possui status operacional `active`/`blocked`: `Workspace.operationalStatus`, migration `20260702182000_workspace_operational_status`, schema compartilhado, `PATCH /backoffice/workspaces/:workspaceId/operational-status`, auditoria `workspace.operational_status_updated` e acao visual de bloquear/desbloquear na area interna. O status tambem entra na sessao autenticada e `WorkspacesService.getCurrentWorkspace` bloqueia rotas autenticadas do cliente quando o workspace esta `blocked`; backoffice de plataforma e webhooks publicos nao usam esse helper central, preservando suporte e ingestao operacional.
- Backoffice financeiro agora lista cobrancas em `GET /backoffice/billing/charges` e renderiza a tabela `Cobrancas Asaas` na area interna, com filtros por `status` e `workspaceId`, workspace, cobranca externa/local, instancia, valor, status e link de checkout quando houver.
- Backoffice financeiro agora possui API de planos da plataforma: `GET /backoffice/billing/plans`, `POST /backoffice/billing/plans` e `PATCH /backoffice/billing/plans/:id`, usando `SubscriptionPlan` para nome, slug, preco fixo por instancia WhatsApp e status ativo/pausado. Criacao e edicao geram `AuditLog` `billing.plan_created`/`billing.plan_updated` com ator `platform_operator`.
- A tela interna de backoffice agora renderiza `Planos de assinatura`, consumindo `/backoffice/billing/plans` e permitindo adicionar/pausar/ativar planos com valor fixo por instancia WhatsApp, sem expor essa configuracao ao usuario final.
- Checkout/cobranca de nova instancia WhatsApp agora usa o plano ativo configurado no backoffice para calcular `quote`, `PaymentCharge.amountCents` e `WhatsappInstanceActivation.amountCents`; sem plano ativo, preserva o fallback `WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS`. Quando o pagamento Asaas confirma, `WorkspaceSubscription.planId` passa a receber o plano ativo para que o resumo financeiro mostre nome/preco reais do plano.
- Planos de assinatura no backoffice agora seguem regra de plano ativo unico: criar um plano ativo ou ativar um plano pausado desativa automaticamente os outros planos ativos dentro de transacao, evitando que o checkout tenha precos ambiguos.
- Backoffice operacional agora lista instancias WhatsApp em `GET /backoffice/workspaces/whatsapp-instances` e renderiza `Instancias WhatsApp` na area interna, com workspace, nome da instancia, provider, status de billing/conexao operacional, id do provider e data de atualizacao para suporte sem abrir banco.
- Rodada Paralela 1 executada e revisada: visual WppTrack/Telemetria Noturna aplicado ao web, Auth/Workspaces iniciado, scaffolds de integracoes Meta/Uazapi/Asaas criados e spec de Diagnosticos/Logs adicionada.
- Verificacao da Rodada Paralela 1: `pnpm test`, `pnpm typecheck`, `pnpm build`, `prisma generate` e `prisma validate` passaram. O bloqueio anterior do Docker Desktop Linux engine foi resolvido quando o Docker Desktop foi aberto.
- Spec e plano da Rodada Paralela 1: `docs/superpowers/specs/2026-07-02-wpptrack-parallel-wave-1-design.md` e `docs/superpowers/plans/2026-07-02-wpptrack-parallel-wave-1-implementation.md`.
- Servidor local usado para visualizar: `http://127.0.0.1:5174/`.
- Repositorio inicial ja possui commits da fundacao da Fase 1.
- Diagnosticos/logs operacionais possuem spec dedicada em `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`; a implementacao Prisma/API ja existe com retry auditado, listagens operacionais, filtros reais, detalhe com timeline e reprocessamento inicial por worker. Proximas ondas devem focar em acoes operacionais adicionais e validacao com provedores reais.

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
- Implementacao atual cobre email/senha completo, recuperacao de senha, verificacao de email e Google OAuth real pelo backend. Para usar Google em ambiente real, configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_STATE_SECRET` e `WEB_ORIGIN` no backend e cadastrar o callback correspondente no Google Cloud Console. `GOOGLE_REDIRECT_URI` aponta para o backend (`/auth/google/callback`) e `WEB_ORIGIN` aponta para o frontend que recebera o usuario autenticado.
- Papeis iniciais no workspace: **owner, admin e member**.
- Semantica visual dos papeis revisada em 2026-07-12: `owner` e o **Responsavel da conta** daquele workspace, `admin` e **Administrador** e `member` e **Analista**. O proprietario global do WppTrack usa o papel separado `platform_owner`; ao entrar no workspace de um cliente, a interface deve mostrar **Acesso de suporte da plataforma**, nunca sugerir que o operador interno se tornou owner do cliente. Convites do workspace continuam limitados a `admin` e `member`.
- Configuracoes foram reorganizadas em 2026-07-12: conta/equipe usam linhas alinhadas e rotulos humanos; a jornada exibe produto, valor e moeda somente para eventos comerciais (`Purchase` e `OrderCreated`); o criador de gatilhos usa o fluxo `Quando -> Entao` e deixa explicito que o modo `contains` reconhece a palavra ou frase dentro de uma mensagem maior, sem diferenciar maiusculas de minusculas.
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
- Implementacao atual ja possui API para listar, criar e atualizar recebedores de split, a tela de backoffice ja lista esses recebedores, os recebedores ativos sao enviados como split percentual na criacao real das cobrancas Asaas e as mutacoes de recebedores ficam auditadas sem expor wallet/email crus.
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
- Permitir acao de reenfileirar/tentar novamente quando for seguro. A API de retry auditado, o botao no backoffice, a tela detalhada e o primeiro worker real de reprocessamento ja existem para conversoes vinculadas; proximos caminhos de retry devem ser adicionados por tipo de integracao quando houver acao segura.
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
- Implementacao atual ja permite criar, listar, atualizar e avaliar regras ativas. O envio Pixel/CAPI possui adapter, fila BullMQ e worker para logs `ready_to_send`; o envio agora busca token CAPI por workspace quando configurado e usa o token global de ambiente apenas como fallback tecnico.
- Webhooks Uazapi ja conseguem aplicar as regras, registrar logs de conversao internos e enfileirar envio Pixel/CAPI para cada log criado. Quando ha `pixelId`, `ad_id` e token CAPI configurado, o worker tenta enviar para a Meta; quando falta contexto/credencial, o log registra o estado operacional sem liberar falso sucesso.
- Envio Pixel/CAPI agora possui fila BullMQ dedicada: webhooks Uazapi criam `ConversionEventLog` e enfileiram jobs na fila `conversion-events`; `ConversionEventProcessor` executa `ConversionEventsService.sendReadyEvent` em worker com retry, evitando que o webhook fique preso na chamada externa da Meta.
- Para enviar um evento ao Pixel, o backend deve buscar o `ad_id` do lead.
- Se houver mais de uma BM/conta conectada no futuro, o backend deve validar a qual BM/conta pertence o anuncio antes de enviar o evento.
- O fluxo padrao do cliente final continua sendo BM/conta de anuncio unica, mas a arquitetura deve tolerar mais de uma conexao Meta quando isso for necessario.
- Uazapi tem endpoints/documentacao publica envolvendo "Chats, Bloqueios, Contatos e etiquetas", incluindo buscar etiquetas e etiquetar chat. A implementacao atual ja persiste etiquetas quando elas chegam no webhook; antes de depender 100% disso em producao, validar no contrato real se a Uazapi dispara webhook quando uma etiqueta e adicionada/removida.
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
- Deploy da API no Dokploy deve usar `Build Type: Dockerfile`, apontando para o `Dockerfile` da raiz. Nixpacks foi descartado neste projeto apos travamentos/falhas com pnpm/Corepack no build remoto.
- A API deste projeto deve usar um subdominio proprio, diferente dos callbacks de outros SaaS ja existentes do usuario. Exemplo: `api.wpptrack.seudominio.com`.
- `API_PUBLIC_URL` e a URL publica da API usada pelo backend para montar callbacks/webhooks externos.
- Para Meta OAuth, cadastrar exatamente `API_PUBLIC_URL/integrations/meta/callback` no painel da Meta e no `.env` em `META_OAUTH_REDIRECT_URL`.
- Para Meta Webhook, usar `API_PUBLIC_URL/webhooks/meta` e `META_WEBHOOK_VERIFY_TOKEN`.
- O popup de Meta OAuth pode voltar por uma origem diferente da API usada pelo frontend em desenvolvimento local. O front deve aceitar a origem do `redirect_uri` extraida da URL OAuth, mas a conexao so aparece como conectada quando frontend e backend leem o mesmo ambiente/banco. Para teste real, preferir frontend publicado apontando `NEXT_PUBLIC_API_URL` para a API publicada.

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
- Leads persistentes iniciados: modelo `Lead`, contratos compartilhados, `GET /leads`, `GET /leads/:id`, upsert via webhook Uazapi, tela `Leads` consumindo backend com estados reais/vazio/erro sem fallback demonstrativo e pagina de detalhe com jornada, conversoes e webhooks vinculados.
- Tela de `Integracoes` agora consulta `GET /billing/whatsapp-instance/quote` e possui formulario real para adicionar instancia WhatsApp via `POST /billing/whatsapp-instance/checkout`; a liberacao continua dependente do pagamento confirmado pelo webhook Asaas.
- O formulario de adicionar instancia em `Integracoes` exibe o valor real de `nextInstanceAmountCents` antes do envio e deixa explicito que o backend criara a cobranca no Asaas antes de liberar a conexao, reforcando o fluxo pagamento-antes-do-uso.
- Criacao de checkout de nova instancia WhatsApp agora registra `AuditLog` `billing.whatsapp_instance_checkout_created` com ator usuario, alvo `PaymentCharge`, valor, instancia, ativacao e status da tentativa Asaas, sem expor URL de checkout nem id externo bruto da cobranca.
- Instancias WhatsApp pendentes agora carregam `checkoutUrl` na listagem quando existe cobranca Asaas criada, permitindo retomar o pagamento pela aba `Integracoes` com a acao `Pagar agora`.
- Billing do cliente ganhou resumo de assinatura em `GET /billing/subscription`, mostrando status, plano, instancias ativas, valor mensal estimado, ciclo atual e assinatura Asaas; a aba `Integracoes` exibe esse resumo sem permitir que o cliente crie planos.
- Tela de `Configuracoes` agora possui CRUD visual inicial para regras de conversao: cria regras por palavra-chave/etiqueta via `POST /conversion-rules` e pausa/ativa regras via `PATCH /conversion-rules/:id`, sem fallback demonstrativo quando a API falha ou retorna vazia.
- Configuracoes agora busca instancias WhatsApp ativas e suas etiquetas Uazapi para sugerir gatilhos reais no campo de regra de conversao; se a API de etiquetas falhar, o usuario ainda pode digitar o gatilho manualmente sem bloquear o fluxo.
- Idempotencia inicial implementada: `WebhookLog.idempotencyKey` e `ConversionEventLog.dedupeKey` sao unicos no banco. Webhooks Uazapi duplicados retornam `duplicate` sem reavaliar regras, recriar lead ou enfileirar novo envio Meta; conversoes duplicadas retornam em `duplicates` sem novo log.
- Central de Diagnostico recebeu filtros reais no backoffice e no endpoint `GET /backoffice/diagnostics/events`: `q`, `since`, `until`, `workspaceId`, `source`, `severity`, `status`, `eventType`, `leadId`, `phoneHash`, `campaignId`, `adSetId`, `adId` e `errorCode`.
- Relatorios removeram as campanhas demo fixas da tabela quando ha resposta da API e agora contam conversas reais a partir de leads persistidos por campanha/periodo.
- Relatorios agora tambem renderizam tabelas de `Performance por conjunto` e `Performance por anuncio`, consumindo `/reports/adsets` e `/reports/ads` com os mesmos filtros de periodo da tela.
- Relatorios por conjunto/anuncio agora persistem insights Meta proprios (`level=adset` e `level=ad`) durante o sync, liberando investimento, conversas Meta e custos por etapa nesses dois niveis.
- Visao Geral foi conectada ao endpoint real de relatorios e passou a agregar os resultados do backend, mantendo fallback somente quando a API nao responde.
- Overview/Reports agora mostram estado vazio real sem cair em mock; falha de API mostra `API indisponivel` e nao injeta dados de demonstracao. O mock web de reporting foi removido.
- Leads agora mostra estado vazio real ou `API indisponivel` sem renderizar pessoas/campanhas ficticias quando a API retorna vazia ou falha.
- Configuracoes agora mostra estado vazio real ou `API indisponivel` para regras de conversao sem renderizar regras ficticias.
- Backoffice agora removeu MRR/workspaces/alertas/tokens ficticios, recebedor Asaas de fallback e linhas demonstrativas da Central de Diagnostico; estados vazios e falhas de API ficam explicitos.
- Integracoes agora salva a selecao Meta BM/conta/pixel por formulario server-side, sem expor token e sem botao falso; a tela tambem deixou de exibir fallback visual/provedores locais e percentuais/latencia inventados no pipeline.
- Layout autenticado do cliente: a sidebar desktop deve permanecer fixa na esquerda durante o scroll, com conteudo compensado pela largura do menu e comportamento normal no mobile. Isso evita telas longas com vazio lateral e botao de sair isolado.
- Divida visual registrada em 2026-07-09: apos estabilizar as funcionalidades, a aba `Integracoes` precisa de uma rodada exclusiva de UI/design-system. Prioridades: mais respiro entre titulos/cards/forms, evitar containers colados, revisar hierarquia tipografica e comparar com o projeto de referencia que o usuario vai enviar. Nao esquecer esse polish antes de considerar a experiencia final aprovada.
- UX/performance registrada em 2026-07-09: acoes longas em `Integracoes` nao podem ficar silenciosas. Formularios de destino CAPI, contas de relatorio, instancia WhatsApp e conexao WhatsApp devem mostrar estado de clique/pending, bloquear duplo clique e voltar com aviso de sucesso/erro. O web server registra requests API lentos com `[wpptrack:web-api]`; a API registra chamadas Meta Graph lentas com `[wpptrack:meta-graph]` e total de ativos com `[wpptrack:meta-assets]` para separar gargalo de Vercel/API/VPS/Meta.
- Performance de `Integracoes` ajustada em 2026-07-09: a abertura da aba nao deve mais ficar esperando Meta Graph. A pagina usa snapshots `MetaAssetSnapshot` via `GET /integrations/meta/assets`; o refresh manual `Atualizar ativos Meta` e a troca de BM nos formularios acionam `POST /integrations/meta/assets/refresh`, que busca no Graph, grava o snapshot e revalida a tela. O Dockerfile da API ja roda `prisma migrate deploy`, entao a migration `20260709170000_meta_asset_snapshots` sobe no proximo deploy da API.
- Integracoes agora tambem exibe status/QR real da conexao Uazapi para instancias WhatsApp ativas, usando os endpoints ja existentes de status/conexao.
- Pipeline de sinal deixou de exibir `aguardando dados`/`sem metrica` fixos e passou a renderizar contadores reais vindos de `WebhookLog`, `Lead` e `ConversionEventLog`.
- API nao registra mais o endpoint legado `/mock/reports/overview`; dados demonstrativos restantes devem existir apenas dentro de testes automatizados.
- `next dev` do web foi estabilizado em 2026-07-02: o Next agora resolve `@wpptrack/shared` para `packages/shared/src` via alias em `apps/web/next.config.mjs`, evitando que o dev server compile o `dist/index.js` CommonJS do pacote compartilhado e quebre com `Cannot use import.meta outside a module` no React Refresh.
- `pnpm --filter @wpptrack/api dev` foi estabilizado em 2026-07-02: o script deixou de usar `nest start --watch`, que tentava executar `dist/main` no caminho errado do monorepo, e passou a usar `node --watch -r ts-node/register src/main.ts`. Teste `apps/api/test/package-scripts.test.ts` protege os entrypoints locais.
- Layout autenticado do cliente agora detecta workspace bloqueado antes de renderizar paginas privadas: se `/workspaces/current` retornar `403` com bloqueio operacional, `apps/web/src/app/(app)/layout.tsx` exibe uma tela unica de `Workspace bloqueado` em vez de deixar cada pagina cair em `API indisponivel`.
- Shell lateral do cliente agora usa contexto real de `/workspaces/current` para nome, slug, papel e status operacional do workspace; os placeholders estaticos de health (`API online`, `Meta v21`, `WhatsApp fila`, `Pixel ativo`) foram removidos do `AppShell`.
- Tela publica de login nao deve afirmar health operacional ou taxas inventadas sem consultar backend. Os antigos cartoes estaticos `API online`, `99.2% aceito`, `Fila estavel` e `Sinal ativo` foram substituidos por cobertura neutra do produto: leads rastreados, campanhas Meta, eventos Pixel e diagnostico.
- Aba `Integracoes` agora trata status inesperados do backend como estado explicito desconhecido em PT-BR (`Status desconhecido` / `Meta com status desconhecido`) em vez de exibir enum bruto ou mascarar como `Meta nao conectado`.
- Aba `Relatorios` agora traduz status conhecidos da estrutura Meta para PT-BR e usa `Status desconhecido` quando campanha/conjunto/anuncio vier sem status, evitando fallback `unknown` na UI.
- Aba `Integracoes` agora mostra assinatura/instancia `active` como `Ativa` e usa `Nao vinculada` quando ainda nao existe `asaasSubscriptionId`, evitando indicar cobranca pendente sem evidencia.
- Aba `Integracoes` agora diferencia selecao Meta stale: quando BM/conta/pixel selecionado nao existe mais na ultima lista sincronizada, a UI mostra `Ativo selecionado fora da ultima sincronizacao` e orienta `Ressincronize a Meta ou escolha outro ativo`.
- Aba `Integracoes` agora removeu `aguardando API`/`sem dados` genericos dos estados indisponiveis de ativos Meta e instancias WhatsApp, mostrando `Leitura de ativos indisponivel`, `Tente novamente apos a API responder` e chips `indisponivel` quando a falha vem da API.
- Aba `Integracoes` agora removeu os ultimos estados genericos do pipeline/WhatsApp: instancia sem `providerInstanceId` mostra `ID Uazapi ainda nao emitido` e pipeline vazio mostra `Aguardando eventos reais`.
- Backoffice de workspaces agora removeu `sem dados` no estado vazio da tabela de customers Asaas, exibindo `Customer Asaas ausente` ou `indisponivel` conforme vazio real ou falha de API.
- Central de Diagnostico agora possui resumo operacional agregado em `GET /backoffice/diagnostics/summary`, com contadores por periodo/workspace para eventos, webhooks, jobs, chamadas externas, eventos Pixel/CAPI, auditorias e falhas. O backoffice usa esse resumo no cartao `Diagnosticos` para mostrar `Saude critica`/`Atencao`/`Saudavel` e quantidade de falhas no periodo sem depender de terminal ou consulta direta ao banco.
- Webhook Meta agora suporta o challenge oficial de inscricao: `GET /webhooks/meta` valida `hub.mode=subscribe`, `hub.verify_token` contra `META_WEBHOOK_VERIFY_TOKEN` e retorna `hub.challenge` sem gravar payload nem acionar efeitos colaterais. Token invalido ou ausente retorna `401`.
- Worker de sincronizacao de relatorios Meta (`meta-report-sync`) agora registra `JobAttempt` real em sucesso e falha, com workspace, periodo, job BullMQ, tentativa, status, erro e resumo de campanhas/conjuntos/anuncios sincronizados. Assim a tabela `Jobs operacionais` mostra a execucao do sync Meta e nao apenas o enqueue.
- Ajuste de sync Meta em 2026-07-09: o botao `Sincronizar Meta` em `Relatorios` agora mostra estado de envio e aviso de sucesso/erro. Cada clique enfileira uma nova tentativa BullMQ com `jobId` unico, evitando que um job antigo falhado no mesmo workspace/periodo bloqueie novas sincronizacoes. Jobs falhados antigos ficam retidos por janela limitada, enquanto `JobAttempt`, `IntegrationLog` e `DiagnosticEvent` preservam a investigacao operacional.
- Correcao de sync Meta em 2026-07-09: logs do Dokploy mostraram `Custom Id cannot contain :` ao enfileirar `POST /reports/meta/sync`. BullMQ nao aceita `:` em `jobId`; os IDs de `meta-report-sync` e `conversion-send` agora usam `createBullJobId` com segmentos unidos por `_`, e os testes protegem que jobs novos nao contenham dois-pontos.
- Sincronizacao automatica Meta adicionada em 2026-07-09: a API possui `MetaReportAutoSyncService`, que periodicamente encontra workspaces ativos com Meta conectada e contas de relatorio ativas, enfileirando `meta-report-sync` para o periodo recente. Configuracao por ENV: `WPPTRACK_META_AUTO_SYNC_ENABLED` (default ligado), `WPPTRACK_META_AUTO_SYNC_INTERVAL_MINUTES` (default 180), `WPPTRACK_META_AUTO_SYNC_INITIAL_DELAY_SECONDS` (default 60), `WPPTRACK_META_AUTO_SYNC_LOOKBACK_DAYS` (default 7) e `WPPTRACK_META_AUTO_SYNC_BATCH_LIMIT` (default 100). O botao `Sincronizar Meta` permanece como atualizacao manual/forcada.
- UX de periodo em `Relatorios` ajustada em 2026-07-09: a tela principal deve mostrar apenas dois campos de data, `Inicio` e `Fim`. Comparacao entre periodos nao deve aparecer como quatro inputs soltos; se voltar, precisa de UI propria/avancada.
- Filtros operacionais em `Relatorios` ajustados em 2026-07-09: os dropdowns de BM/conta devem usar apenas `MetaReportingAccount` ativas configuradas em `Integracoes`, nao todos os BMs do OAuth. A API aceita filtros `nameScope` (`campaign`, `adset`, `ad`), `nameContains` e `status` (`all`, `active`, `paused`) em campanhas, conjuntos, anuncios e export CSV. A UI preserva esses filtros em periodo, sincronizacao e exportacao.
- UX de tabelas em `Relatorios` ajustada em 2026-07-09: tabelas de campanha, conjunto e anuncio devem ter rolagem interna com cabecalho fixo, evitando scroll infinito da pagina quando houver muitas campanhas/conjuntos/anuncios.
- Ajuste visual de `Relatorios` em 2026-07-09: sidebar do app cliente agora e retratil/expansivel e libera largura real para as tabelas quando recolhida. As tabelas de campanhas, conjuntos e anuncios usam primeira coluna mais larga, tipografia mais compacta para nomes longos e linha fixa de resumo no rodape com contagem por status e totais de investimento/conversas/conversoes.
- Diagnostico de estrutura Meta em `Relatorios` ajustado em 2026-07-09: a antiga tabela aberta `Estrutura Meta` foi rebaixada para um bloco recolhivel `Diagnostico da sincronizacao Meta`, com contadores compactos de campanhas/conjuntos/anuncios/contas e estrutura tecnica em scroll interno. Essa area deve ser tratada como suporte/debug, nao como relatorio principal para o cliente.
- Filtros da estrutura tecnica Meta em `Relatorios` ajustados em 2026-07-09: o bloco de diagnostico possui filtros proprios por nome de campanha/conjunto/anuncio e status `Todos/Ativos/Inativos`, preservando filtros principais da pagina. Quando ha filtro aplicado, o diagnostico abre automaticamente. A tabela tecnica mantem cabecalho e primeira coluna fixos para reduzir confusao visual em scroll horizontal.
- Instancias WhatsApp com provider `cloud_api` agora possuem caminho operacional explicito: status/conectar/QR/etiquetas retornam `not_configured` seguro enquanto a Cloud API oficial nao estiver configurada, registram `IntegrationLog` com `source: meta` e nao chamam Uazapi nem descriptografam tokens. Isso deixa o adapter oficial preparado para evolucao sem quebrar a operacao atual em Uazapi.
- Parser de webhooks Uazapi/CTWA agora extrai atribuicao de formatos top-level e aninhados: `campaignId/campaign_id/utm_campaign`, `adSetId/adset_id/ad_set_id/utm_adset`, `adId/ad_id/source_id`, `message.referral`, `context.referral` e `ads_context_data`. A atribuicao normalizada alimenta `WebhookLog`, `Lead` e `ConversionEventLog`; etiquetas como objetos (`name`, `title`, `label`) continuam virando gatilhos legiveis.
- Endpoints de relatorios agora validam periodo antes de consultar ou enfileirar sync: `since` e `until` precisam estar juntos no formato `YYYY-MM-DD`, datas invalidas retornam `400` e periodos invertidos (`since > until`) tambem retornam `400`. A regra vale para campanhas, export CSV, conjuntos, anuncios e `POST /reports/meta/sync`.

Proximo passo operacional:

- Modulo CAPI WhatsApp implementado em 2026-07-09 a partir da spec `docs/superpowers/specs/2026-07-09-wpptrack-capi-conversion-events-design.md`: eventos `LeadSubmitted`, `QualifiedLead`, `Purchase` e registry expandido usam destino unico Pixel + Pagina, token OAuth Meta criptografado, parser Uazapi com `ctwa_clid`, fila BullMQ e diagnosticos de bloqueio/envio. Usuario final nao informa token CAPI manual.
- Webhooks Uazapi com CTWA agora persistem `ctwa_clid` no lead, criam `LeadSubmitted` automatico para leads elegiveis, avaliam regras por palavra-chave/etiqueta e enfileiram apenas eventos `ready_to_send`. Eventos sem `adId`, sem `ctwa_clid` ou sem valor obrigatorio ficam bloqueados com diagnostico (`pending_meta_context`/`pending_value`) ate haver contexto suficiente.
- Payload Meta CAPI agora usa `action_source: business_messaging`, `messaging_channel: whatsapp`, `ctwa_clid`, `page_id`, `ad_id`, valores quando exigidos e `test_event_code` no endpoint de teste controlado do backoffice (`POST /backoffice/diagnostics/conversions/test`). Diagnosticos exibem metadados CAPI com `ctwaClid` mascarado e sem expor `access_token`.
- Paridade R100 WPP para CAPI: WppTrack deve reaproveitar o comportamento de envio de conversoes do R100, incluindo payload `business_messaging`, `page_id`, `ctwa_clid`, `Purchase` com `order_id`, `content_type`, `contents` e `num_items`, mas sem trazer chat, CRM, Kanban ou atendimento.
- Decisao de fase registrada em 2026-07-09: como a operacao atual de WhatsApp usa Uazapi/API nao oficial e o fluxo ja foi validado no R100 WPP/N8n, o CAPI desta etapa permanece com `page_id`. `whatsapp_business_account_id`/WABA nao deve bloquear nem substituir este payload agora; fica planejado para a futura integracao WhatsApp Cloud API oficial.
- Testes automatizados ja executados para a etapa CAPI/paridade R100: `meta-capi-payload-builder.test.ts`, `meta-capi-adapter.test.ts`, `conversion-events-service.test.ts` e `pnpm --filter @wpptrack/api typecheck` passaram antes do commit `a31a7df feat: align capi purchase payload with r100`.
- Decisao operacional em 2026-07-10: o teste real com Uazapi/CAPI (`ctwa_clid`, `ad_id`, payload real de webhook e envio real para Meta) sera feito mais para frente, quando a plataforma estiver mais pronta. Esse teste nao deve bloquear a continuidade do desenvolvimento; se o payload real vier diferente, ajustar o parser depois com base no dado real.
- Ordem aprovada para continuidade: 1) criar a spec do modulo de formulas e metricas finais de relatorios; 2) implementar um motor backend centralizado de metricas; 3) aplicar esse motor nos relatorios de visao geral, campanhas, conjuntos e anuncios; 4) depois voltar para o teste real Uazapi/CAPI e corrigir qualquer ajuste fino de payload.
- Spec de formulas e metricas finais aprovada e escrita em 2026-07-10: `docs/superpowers/specs/2026-07-10-wpptrack-reporting-metrics-formulas-design.md`. Decisoes centrais: telefone normalizado do WhatsApp e a identidade principal do lead; `LeadSubmitted` aparece como `Conversas reais iniciadas`; `QualifiedLead` aparece como `Lead qualificado`; `Purchase` aparece como `Compras`; organico entra na saude geral do negocio sem contaminar ROAS/custos de midia; primeira compra e recompra sao separadas por telefone; ROAS principal tem duas visoes, `ROAS de aquisicao` e `ROAS com recompra`; evento real conta no dashboard mesmo se o envio para Meta falhar, e falhas entram na auditoria de eventos Meta.
- Implementacao do motor de metricas executada em 2026-07-10 a partir do plano `docs/superpowers/plans/2026-07-10-wpptrack-reporting-metrics-engine-implementation.md`: contratos compartilhados, Prisma, motor puro de metricas, `MetaReportingService`, CSV, `Visao geral` e `Relatorios` agora usam a mesma fonte de formulas. O contrato removeu metricas duplicadas de `LeadSubmitted` e passou a expor conversas reais, leads organicos, total recebido, taxa de rastreamento, lead qualificado, compras, primeira compra, recompra, faturamento de trafego, faturamento organico, faturamento total, ROAS de aquisicao e ROAS com recompra.
- Eventos de conversao ganharam campos de reporting em 2026-07-10: `eventOccurredAt`, `customerIdentityKey`, `businessSource` (`paid`/`organic`) e `purchaseKind` (`first_purchase`/`repurchase`). A migration real e `20260710020000_conversion_event_reporting_fields`; antes de validar em producao, aplicar essa migration na API/Dokploy com o fluxo normal de deploy. Nao foram criadas novas ENV nesta etapa.
- Regras de metrica aprovadas em 2026-07-10: `LeadSubmitted` nao aparece como card separado porque e a propria conversa real iniciada; `QualifiedLead` aparece como `Lead qualificado`; `Purchase` aparece como `Compras`; eventos organicos entram na saude geral do negocio sem contaminar custos/ROAS de midia; recompras entram em `ROAS com recompra`, enquanto `ROAS de aquisicao` usa apenas primeira compra de trafego pago.
- Auditoria de conversoes Meta iniciada em 2026-07-10: o backend possui `GET /reports/conversions/audit`, retornando eventos recentes com status, erro, origem paga/organica, tipo de compra, horario do evento e labels em PT-BR. A UI principal ja usa os agregados, mas ainda falta criar uma tela/area visual dedicada para auditoria detalhada de envios Meta dentro do produto.
- Verificacao automatizada da implementacao de metricas em 2026-07-10: passaram `pnpm --filter @wpptrack/shared test -- contracts.test.ts`, `pnpm --filter @wpptrack/api test -- conversion-events-service.test.ts reporting-controller.test.ts meta-reporting-service.test.ts reporting-metrics-engine.test.ts`, `pnpm --filter @wpptrack/web test`, `pnpm --filter @wpptrack/shared typecheck`, `pnpm --filter @wpptrack/api typecheck`, `pnpm --filter @wpptrack/web typecheck` e `git diff --check`.
- Plano de recuperacao do produto aprovado em 2026-07-10 e registrado em `docs/superpowers/plans/2026-07-10-wpptrack-product-recovery-page-by-page.md`. Ordem atualizada e aprovada em 2026-07-11: Bloco 0 performance/regressoes; Bloco 0.5 fundacao de dados externos MySQL/Kinbox; Bloco 1 Visao Geral; Bloco 2 Leads; Bloco 3 Relatorios; Bloco 4 Integracoes, Configuracoes e Auditoria de eventos Meta; Bloco 5 productizacao de conectores externos e providers nativos. A fundacao foi antecipada para validar as paginas com dados WhatsApp reais; autosservico e expansao de providers continuam depois do Bloco 4.
- O plano de recuperacao substitui como prioridade imediata a antiga instrucao de voltar ao teste real Uazapi/CAPI logo apos o motor de metricas. O teste real continua obrigatorio e registrado, mas permanece adiado ate a plataforma estar suficientemente completa para validacao ponta a ponta.
- Diagnostico que abre o Bloco 0: o periodo padrao `Ultimos 7 dias` hoje nao envia datas e pode ler todo o historico; Relatorios repete consultas de leads/eventos para campanhas, conjuntos e anuncios; a renderizacao server-side bloqueia a navegacao; as tabelas possuem colunas demais; e falha ao carregar workspace pode esconder o botao Meta como se fosse falta de permissao.
- Referencias visuais aprovadas para a recuperacao: WppTrack continua como design system e regra de produto; o repositorio atual do Renato `renatodomiciano/rastrack-dash` foi revisado no commit `790aba7` para hierarquia visual; o R100 WPP serve de referencia apenas para dashboard/rastreamento/conversoes, sem trazer chat, CRM, Kanban ou atendimento.
- Bloco 0 de recuperacao implementado localmente em 2026-07-10: periodo padrao real de sete dias; leituras paginadas de campanhas, conjuntos, anuncios e leads; somente o nivel ativo de Relatorios e carregado; diagnostico Meta passou a ser sob demanda; eventos/leads sao consultados apenas para IDs da pagina; workspace e deduplicado por request; shell ganhou loading de rota; chamadas Uazapi de status/etiquetas possuem espera limitada; e logs de duracao identificam requests e leituras lentas. A migration `20260710113000_report_read_indexes` adiciona indices de periodo/hierarquia.
- A regressao do botao Meta foi corrigida: falha temporaria ao ler permissoes nao e mais exibida como `sem permissao` e nao remove o botao conectar/trocar conta; configuracoes sensiveis continuam protegidas e o backend valida a autorizacao final.
- Verificacao local do Bloco 0 em 2026-07-10: 522 testes passaram, todos os typechecks passaram, build de producao forcado sem cache passou, Prisma validou e as migrations pendentes foram aplicadas no PostgreSQL local. Em segunda leitura no Next dev, Overview respondeu em 93 ms, Relatorios em 152 ms, Leads em 106 ms e Integracoes em 165 ms; a medicao ainda precisa ser repetida em producao com os dados reais.
- Estado atual da ordem aprovada: **Bloco 0 implementado e em observacao de producao; Bloco 0.5 com backfill Barbieri reconciliado, QualifiedLead e Purchase ativos, e replacement de conversation_started sem HMAC ativo depois de teste seguro aprovado na URL de producao; o primeiro lead real foi gravado no ledger MySQL, sincronizado sem rejeicoes e confirmado na pagina Leads do workspace Barbieri; telefone completo, fuso e reimportacao foram publicados, e o bloco atual reconstrui marcos historicos e alimenta o resumo global da Visao Geral antes da resolucao de campanhas; o cutover CAPI continua bloqueado ate reconciliacao explicita**.
- Necessidade adicional registrada em 2026-07-11: alguns clientes usam uma API oficial de WhatsApp propria, com automacoes em n8n, e persistem leads, conversas, atribuicao e eventos em MySQL. O WppTrack deve aceitar esse banco como fonte alternativa de entrada para que o cliente use dashboard, relatorios e CAPI sem contratar a instancia Uazapi da plataforma.
- A integracao MySQL sera implementada como adapter de fonte por workspace, normalizando dados para os modelos internos ja usados por Uazapi. Uazapi continua como provider nativo e a futura Cloud API continua planejada; relatorios e formulas nao podem depender do provider de origem.
- Regras de seguranca do conector externo: acesso exclusivamente server-side; usuario MySQL dedicado e somente leitura; credenciais criptografadas e omitidas de logs/frontend; TLS e allowlist de rede quando disponiveis; sincronizacao assincrona, incremental, idempotente e retomavel; nenhuma escrita no banco do cliente nesta etapa.
- O schema MySQL padronizado foi recebido e analisado em 2026-07-11. `facebook_ads_*` nao sera fonte recorrente: Meta OAuth/Graph API continua como fonte oficial de campanhas e metricas; a tabela externa serve apenas para backfill legado anterior a uma data de corte ou reconciliacao controlada. `whatsapp_anuncio_*` permite backfill de leads, mas o modelo atual de uma linha por telefone nao preserva varias conversas/compras.
- Payload oficial de novo lead recebido e mapeado: `messages[].id` e idempotencia; `messages[].from`/`contacts[].wa_id` e telefone; `messages[].timestamp` e ocorrencia; `metadata.phone_number_id` e `entry[].id` resolvem a conexao oficial; `referral.source_id`, `ctwa_clid` e `source_url` preservam atribuicao. Por decisao operacional explicita de 2026-07-12, o adapter n8n atual aceita o POST sem HMAC e prioriza persistencia antes do ACK; uma eventual validacao pertence ao futuro adapter nativo e nao pode bloquear a captura.
- Payload Kinbox recebido e mapeado: telefone e `lead_id` identificam o lead, enquanto o tipo canonico nao depende de `event_name`; cada workflow/rota configura explicitamente `QualifiedLead` ou `Purchase`. Como atribuicao costuma vir vazia no Kinbox, o backend recupera `ctwa_clid` e IDs Meta do lead original pelo telefone.
- Regra exclusiva do adapter Kinbox aprovada em 2026-07-11: `QualifiedLead` conta uma vez por conector e lead. Sem transaction ID do provider, `Purchase` conta no maximo uma vez por conector, lead e dia civil no fuso do workspace; repeticoes no mesmo dia ficam auditadas como duplicadas, compra em outro dia vira novo evento e pode ser classificada como recompra. O event/transaction ID interno deriva da chave idempotente e permanece estavel em retries. **Esta regra diaria nao e global**: outros providers podem registrar varias compras no mesmo dia quando fornecerem transaction ID ou event ID confiavel.
- Kinbox nao fornece valor real neste cliente. O valor medio configurado no WppTrack sera copiado para cada nova compra, preservado historicamente e marcado com origem `configured_average`; dashboard/PDF devem apresentar faturamento e ROAS como estimados quando usarem esse valor. Valores reais de conectores futuros terao prioridade.
- Workflow n8n de Purchase analisado em 2026-07-11: o fluxo atual busca lead e tokens no MySQL, descobre Pixel/Pagina por `source_id`, envia CAPI antes de persistir a compra e usa `event_id` baseado apenas em `ctwa_clid`, o que impede recompras corretas. O valor `4000` esta fixo e a atualizacao sobrescreve a linha unica do telefone. O fluxo novo deve persistir primeiro no ledger append-only e deixar o WppTrack enviar CAPI com OAuth/destino ja configurados.
- O export n8n possui `pinData` com dados reais e um token Uazapi gravado diretamente em um no HTTP desconectado. Antes de reutilizar/compartilhar o workflow, remover dados fixados, mover segredos para credenciais n8n e rotacionar o token exposto. O webhook Kinbox tambem precisa de segredo por conector, pois a rota atual nao mostra autenticacao.
- Usuario confirmou que nenhuma outra automacao ou relatorio consome atualmente `data_compra`, `valor_venda`, `status=Comprou` ou `processado=P`; o relatorio planejado no Looker nao foi desenvolvido. Portanto, a nova tabela append-only pode virar fonte oficial e a tabela `whatsapp_anuncio_*` fica apenas como snapshot/backfill legado, sem contrato de compatibilidade com Looker.
- Arquitetura do conector externo aprovada em 2026-07-11. A spec consolidada e `docs/superpowers/specs/2026-07-11-wpptrack-external-mysql-kinbox-data-foundation-design.md` e o plano executado e `docs/superpowers/plans/2026-07-11-wpptrack-external-mysql-kinbox-foundation-implementation.md`.
- Fundacao MySQL/Kinbox implementada localmente em 2026-07-11: models/migration Prisma para conectores, cursores e auditoria de ingestao; credenciais AES-256-GCM; adapter `mysql2` server-side; views fixas; sync incremental BullMQ; agendamento automatico; endpoints restritos a platform admin; modo sombra; health; JobAttempt/IntegrationLog; ledger SQL e guia n8n em `docs/setup/external-mysql/`.
- Politica de compra preservada na implementacao: somente `kinbox_mysql` usa fallback de uma compra por telefone/dia local quando nao existe ID confiavel. Providers com `external_event_id` ou `transaction_id` podem registrar varias compras no mesmo dia. Os testes automatizados cobrem os dois comportamentos.
- Valores medios Kinbox sao copiados para o evento no momento da ingestao com `valueSource=configured_average`. Contratos de relatorio agora incluem `estimatedRevenueCents` e `hasEstimatedRevenue`; o historico nao muda quando a configuracao futura for alterada.
- Verificacao local do Bloco 0.5 em 2026-07-11: 408 testes da API e 54 testes compartilhados passaram; typechecks de shared/API/web, build da API, build de producao do web, Prisma validate e `git diff --check` passaram. Nenhuma conexao ao MySQL do cliente foi realizada e nenhuma credencial foi solicitada no chat.
- Gate de leads do Bloco 0.5 aprovado em producao: `vw_wpptrack_leads` e workspace Barbieri retornaram exatamente 125 registros. O proximo gate e o dual-write append-only de `conversation_started`, `qualified_lead` e `purchase` nos workflows n8n, mantendo o envio CAPI antigo ativo ate reconciliar os eventos.
- Infraestrutura Barbieri validada em 2026-07-11: views padronizadas criadas, usuario `wpptrack_reader` limitado a `SELECT`, porta externa dedicada protegida por allowlist do IP da API e teste server-to-server concluido com 116 leads e 0 eventos. O n8n continua usando host/porta internos e nao foi interrompido.
- Decisao aprovada em 2026-07-11: clientes devem ser provisionados em workspaces proprios com primeiro usuario `owner`; dados Barbieri nao entram no Workspace Teste. O usuario master existente sera `platform_owner` persistente, com acesso global por contexto de suporte auditado e sem aparecer como membro das equipes dos clientes.
- Bloco adicional concluido localmente em 2026-07-11 antes da reconciliacao sombra: papeis persistentes `platform_owner`/`platform_operator`, provisionamento atomico de cliente + primeiro owner, contexto de suporte auditado por sessao, equipe interna fora da lista de membros do cliente e operacao segura dos conectores MySQL no backoffice. Spec: `docs/superpowers/specs/2026-07-11-wpptrack-platform-owner-client-provisioning-design.md`. Plano: `docs/superpowers/plans/2026-07-11-wpptrack-platform-owner-client-provisioning-implementation.md`.
- O usuario master existente deve ser promovido apos o deploy pela operacao idempotente `platform-owner:promote`; ela preserva senha, memberships e dados atuais. A allowlist `WPPTRACK_PLATFORM_ADMIN_EMAILS` permanece apenas como compatibilidade de bootstrap, nao como fonte definitiva de permissao.
- Navegacao do owner ajustada em 2026-07-11: usuarios com `platform_owner` ou `platform_operator` continuam usando normalmente o proprio workspace e recebem a secao condicional `Plataforma > Backoffice` na sidebar. Usuarios de clientes nao recebem esse link no HTML. A entrada em workspace de cliente continua sendo contexto de suporte auditado, sem assumir credenciais ou criar membership oculto.
- Verificacao do bloco de provisionamento em 2026-07-11: 427 testes da API, 86 do web e 54 de contratos compartilhados passaram; typechecks, builds de producao, Prisma validate/migrate status, verificacao HTTP autenticada e revisao de vazamento de credenciais passaram. O backoffice foi conferido em 1440 px e 390 px sem overflow horizontal.
- Operacao Barbieri avancou em 2026-07-11: workspace proprio provisionado, conector MySQL testado/ativado em modo sombra e primeiro backfill reconciliado com paridade exata de 125/125 leads. O backoffice mostra status terminal e totais agregados; formularios administrativos salvam sem mover a rolagem. Na pagina Leads, `25 pendencias` representa apenas os 25 itens da pagina atual sem `ConversionEventLog`, nao falha de importacao; `Campanha nao resolvida` ainda exige reconciliacao `ad_id -> anuncio -> conjunto -> campanha` com os snapshots Meta do workspace e fica registrado para o Bloco 2.
- Diagnostico da primeira consulta apos a sincronizacao em 2026-07-12: o operador ja estava corretamente no contexto de suporte Barbieri. O lead real estava no app, mas a busca pelo telefone completo retornava zero porque `phoneDisplay` continha somente o numero mascarado; a busca pelos quatro ultimos digitos confirmou o registro. A API foi corrigida e publicada para pesquisar o SHA-256 do numero normalizado e salvar/exibir o telefone completo formatado dentro do workspace autenticado. O backoffice ganhou `Reimportar leads`, que rele a view MySQL sem mover o cursor incremental nem inflar duplicados de lead; o refresh tambem pode reconstruir marcos historicos importados, mas nunca os coloca na fila CAPI. Datas do frontend usam explicitamente `America/Sao_Paulo`, mantendo UTC no armazenamento.
- A antiga nota do lead era apenas uma heuristica fixa, sem IA nem modelo comportamental. Por decisao do produto em 2026-07-12, o campo foi removido do contrato compartilhado, da API, da lista e do detalhe de Leads para nao apresentar uma previsao que o WppTrack ainda nao calcula.
- Workflow Kinbox de Lead Qualificado revisado em 2026-07-11: o fluxo ativo busca o telefone, descobre Pixel/Pagina, envia `QualifiedLead` para a Meta e so depois atualiza o snapshot legado. O artefato sanitizado `docs/setup/external-mysql/n8n/kinbox-qualified-lead-dual-write.json` grava `qualified_lead` no ledger antes desses efeitos, normaliza telefone e trata retries por `duplicate_count`. `pinData`, IDs internos e o no HTTP desconectado com token inline foram removidos; o token exposto ainda deve ser rotacionado. O novo workflow foi importado e ativado no n8n, mantendo o anterior inativo para rollback; a reconciliacao do primeiro evento real continua pendente.
- Workflow Kinbox de Purchase revisado e transformado em 2026-07-11: `docs/setup/external-mysql/n8n/kinbox-purchase-dual-write.json` grava uma compra por telefone/dia local antes dos efeitos externos, incrementa `duplicate_count` em retries e deixa `value_cents/value_source` nulos para o WppTrack aplicar o ticket medio configurado. O CAPI legado de R$ 4.000 foi mantido apenas durante a sombra e seu `event_id` passou a usar hash do telefone + data local, permitindo recompra em outro dia. `pinData`, IDs internos e o no desconectado com token foram removidos. O novo workflow foi importado e ativado, com o anterior inativo para rollback; o primeiro evento real ainda esta pendente.
- O arquivo local `Etapa 4 - Recebimento de Mensagens.json` foi descartado como fonte para `conversation_started`: ele recebe formato Uazapi (`wa_chatid`/`externalAdReply`), usa tabelas com sufixo `wesley` e nao representa o webhook oficial Meta Developers da Barbieri.
- O export correto `Etapa 2 - [Meta] Recebimento de Mensagem.json` foi recebido e transformado em `docs/setup/external-mysql/n8n/meta-conversation-started-dual-write.json`. O primeiro replacement usava HMAC e rejeitou um lead real com `401`, motivando rollback imediato ao workflow anterior. Em 2026-07-12, por decisao explicita do operador, o replacement foi reconstruido sem validacao de assinatura, sem App Secret, sem Raw Body/binario e sem ramo `401`: recebe o JSON normal, salva a entrega no inbox antes do ACK 200, normaliza todas as mensagens, grava `conversation_started` no ledger por `wamid` e so entao segue para os efeitos legados. O teste seguro sem Crypto foi aprovado primeiro pela Test URL e depois pela Production URL usando um payload Meta real com `wpptrack_test_mode=true`; inbox e normalizacao executaram, enquanto ledger, lead e CAPI permaneceram sem efeitos. O workflow anterior foi desativado, o replacement esta ativo e o primeiro lead real foi gravado corretamente em `wpptrack_tracking_events`; a sincronizacao seguinte do conector terminou com 135 importados acumulados, 2 duplicados, 0 rejeitados e 0 pendentes, e o lead foi confirmado na UI Barbieri. A revisao posterior encontrou o filtro CTWA depois do upsert legado; o artefato foi corrigido no commit `c490c37` para executar `Wait1 -> Filter CTWA -> Inserir ou atualizar Lead no Banco -> CAPI`. O JSON corrigido ainda precisa substituir o workflow ativo. Durante essa observacao, o CAPI legado do n8n continua ativo e o conector WppTrack permanece em sombra para evitar envio duplicado.
- Projecao historica e Visao Geral ajustadas em 2026-07-12: `qualified_at` e `purchased_at` da view de leads geram somente eventos ausentes com status `imported`, identidade compativel com o ledger Kinbox e nenhuma fila CAPI; `first_message_at` permite exibir e filtrar `LeadSubmitted` sem inventar `wamid`; o ultimo evento usa `eventOccurredAt`; e `GET /reports/campaigns?includeSummary=true` calcula o resumo global do workspace mesmo com zero campanhas Meta resolvidas. A consulta global fica restrita a Visao Geral para nao reintroduzir o custo removido da pagina Relatorios.
- Reconciliacao de hierarquia Meta implementada em 2026-07-12: a sincronizacao de relatorios continua buscando anuncios por conta ativa em lote e, depois de persistir os snapshots `MetaAd`, preenche `campaignId` e `adSetId` de `Lead` e `ConversionEventLog` pelo `adId`. As atualizacoes sao agrupadas por campanha/conjunto e atingem apenas linhas vazias ou divergentes. A importacao externa tambem carrega os snapshots locais de todos os `ad_id` de cada pagina com uma unica consulta, enriquecendo leads e eventos novos sem chamada Graph por registro. Registros cujo anuncio ainda nao exista no snapshot permanecem intactos e podem ser resolvidos por uma sincronizacao Meta futura. A migration `20260712153000_conversion_event_ad_hierarchy_index` adiciona o indice usado pela reconciliacao dos eventos.
- Fluxo pos-OAuth Meta corrigido em 2026-07-12: o frontend confirma que a conexao foi persistida, atualiza os ativos e so entao recarrega `Integracoes`; a conexao real tem prioridade sobre um snapshot antigo no status da tela. O primeiro refresh carrega os BMs e somente os ativos do primeiro BM, evitando fan-out e permitindo configurar conta, Pixel e Pagina sem precisar alternar manualmente o seletor. Acoes Meta ficam alinhadas pelo topo para mensagens de erro nao deslocarem o botao vizinho, e uma sincronizacao sem BMs agora explica que o usuario Meta nao possui Business Manager acessivel.
- Contrato OAuth Meta endurecido em 2026-07-12 depois de a Barbieri exibir falso sucesso sem `MetaIntegration`: o callback exige `state` assinado e so informa sucesso quando a conexao foi salva no mesmo workspace; o endpoint e as duas acoes de refresh rejeitam qualquer resultado diferente de `connected`. `MetaConnectionsService` deixou de ser dependencia opcional no modulo Nest. O mesmo usuario/token Facebook pode conectar workspaces diferentes, pois a unicidade permanece exclusivamente em `MetaIntegration.workspaceId`; um teste de regressao cobre conta geral e Barbieri com o mesmo token.
- Causa raiz adicional do OAuth em suporte corrigida em 2026-07-12: o botao fazia `meta/start`, conferencia da conexao e refresh diretamente do navegador para o subdominio da API. Depois da migracao para `AUTH_COOKIE_DOMAIN`, um cookie host-only legado da API podia coexistir com o cookie compartilhado; como a API escolhe o primeiro `wpptrack_session`, o OAuth podia usar a sessao principal PalmUp enquanto a pagina server-side mostrava Barbieri. Inicio e conclusao Meta agora usam server actions do app, conferem o `workspaceId` exibido antes de iniciar e antes/depois do refresh, e bloqueiam explicitamente PalmUp enquanto o contexto e Barbieri. Login e logout tambem limpam o cookie host-only legado quando existe dominio compartilhado.
- Selecao de ativos Meta corrigida em 2026-07-12: carregar outro BM nao revalida mais a pagina no meio da interacao nem restaura o primeiro BM. O backend persiste o BM solicitado no workspace e limpa conta/Pixel selecionados do BM anterior para impedir combinacoes inconsistentes; os formularios tambem preservam a escolha local enquanto ela continuar valida. BM, conta de anuncio, Pixel e pagina agora usam um combobox pesquisavel por nome ou ID, com busca sem diferenca de acentos e exibicao do ID para distinguir nomes repetidos. A regressao ficou coberta por testes do componente e do `MetaConnectionsService`; a verificacao final passou com 599 testes e builds de producao de shared, API e web.
- Relatorios Meta corrigidos em 2026-07-12 apos campanha, conjunto e anuncio exibirem investimentos incompativeis. A causa raiz era a leitura de somente uma pagina do Insights: a estrutura seguia `paging.next`, mas `level=campaign`, `level=adset` e `level=ad` descartavam todas as paginas seguintes e os snapshots sem insight eram gravados com zero. Os tres niveis agora usam a mesma coleta paginada, `limit=100`, seguem ate o fim de `paging.next` e falham explicitamente em vez de truncar silenciosamente acima do limite de seguranca.
- O rodape de Relatorios deixou de comparar subtotais da pagina atual. A API calcula e devolve `totals` sobre todos os registros do filtro, mesmo quando somente dez linhas estao visiveis; a UI mostra `Total do filtro` e informa quantos itens estao exibidos do total. Campanha, conjunto e anuncio continuam sendo consultas independentes, mas passam a usar toda a hierarquia sincronizada no mesmo recorte.
- O periodo do investimento Meta agora e auditavel. `MetaReportingAccount` persiste `lastSyncSince` e `lastSyncUntil` pela migration `20260712190000_meta_reporting_sync_period`; Relatorios preenche os campos Inicio/Fim com o periodo efetivo retornado pela API, mostra o periodo solicitado e o ultimo periodo Meta, e alerta quando eles divergem ou ainda nao foram registrados. A janela automatica de sete dias foi corrigida de oito dias inclusivos para sete e usa `America/Sao_Paulo` por padrao, configuravel por `WPPTRACK_REPORT_TIMEZONE`.
- Fonte de verdade mantida: investimento, impressoes e conversas Meta sao sincronizados pela API oficial Meta; o MySQL externo alimenta leads e eventos e pode apoiar reconciliacao, mas nao substitui o Insights para gasto recorrente. Depois do deploy desta correcao, e obrigatorio executar uma nova `Sincronizar Meta` no periodo desejado para substituir os snapshots parciais existentes e gravar o intervalo auditavel.
- Ordem de trabalho aprovada em 2026-07-12: primeiro estabilizar Relatorios Meta; em seguida tratar Leads historicos nao resolvidos. O gate de leads foi implementado depois da estabilizacao de Insights: `QualifiedLead`/`Purchase` sem cruzamento com um lead de origem conhecido permanecem auditaveis como rejeitados, mas nao criam lead operacional, nao entram em indicadores e nao seguem para CAPI.
- Verificacao local da correcao de Relatorios em 2026-07-12: 447 testes da API, 99 do web e 54 de contratos compartilhados passaram, totalizando 600. Typechecks de shared/API/web, build Nest sem regeneracao concorrente do Prisma, build de producao Next e `prisma validate` passaram. O comando agregado de build encontrou somente o lock local `EPERM` da DLL Prisma porque a API dev estava ativa; o client ja havia sido gerado e o build Nest isolado passou sem erro de codigo.
- Gate de eventos Kinbox corrigido em 2026-07-12 depois de surgirem `Lead sem nome` com telefones como `+3088...` e `+20260712`. A causa era dupla: os workflows gravavam o payload bruto no ledger antes de `Busca Telefone`, e o backend reutilizava o upsert de conversa para promover qualquer `QualifiedLead`/`Purchase` a `Lead`. O payload real de `EnvioProposta` confirmou identidades distintas: `phone=554888685127` e `external_id/lead_id=30884074`; o segundo valor e apenas metadado Kinbox e nunca pode ser normalizado como telefone. Os artefatos `kinbox-qualified-lead-dual-write.json` e `kinbox-purchase-dual-write.json` agora usam `INSERT ... SELECT` sobre `whatsapp_anuncio_barbieri`; sem linha encontrada nao ha evento, e telefone/ID/atribuicao sempre saem da linha real do banco. No app, telefones operacionais exigem 10 a 15 digitos; somente `conversation_started` pode criar lead; eventos posteriores cruzam por hash do telefone ou pelo `external_lead_id` de uma importacao existente.
- A sincronizacao de eventos agora reconcilia automaticamente os leads artificiais legados com `source=external_mysql` e sem timestamps de mensagem. Quando `external_lead_id` encontra o lead real, evento e conversao sao reassociados; sem correspondencia, a ingestao vira `rejected`, o `ConversionEventLog` vira `skipped` e o lead artificial e removido, preservando auditoria e excluindo o registro de Leads/Relatorios. Status e monotonicamente protegido para `QualifiedLead` atrasado nao rebaixar uma compra. A ordem de sync e sempre `leads -> events`, e rejeicoes por ausencia de lead podem ser reprocessadas quando a origem aparecer.
- Aplicacao operacional concluida: os workflows corrigidos de Lead Qualificado e Purchase foram ativados e o conector MySQL Barbieri foi resincronizado; o lead artificial `30884074` desapareceu da experiencia operacional. A regressao automatizada reproduz exatamente `phone=554888685127` + `externalLeadId=30884074`, exige associacao exclusiva ao hash do telefone real e comprova que nenhum novo lead e criado. Um teste de contrato tambem inspeciona os dois exports n8n e impede `lead_id/external_id` nos replacements da coluna `phone`. Verificacao local atual: 456 testes da API, 99 do web e 54 compartilhados passaram (609 no total), alem de `pnpm lint` e parse dos dois exports n8n.
- Experiencia de Leads e Integracoes refinada no commit `76d57ca`: a coluna de campanha usa a hierarquia autoritativa do snapshot `MetaAd` e nao confunde mais nome de anuncio com campanha; fontes externas aparecem ao cliente apenas como integracao MySQL generica; diagnosticos e configuracoes administrativas de conectores permanecem exclusivos do backoffice da plataforma; e Leads possui filtro visivel de periodo por primeira mensagem em `America/Sao_Paulo`, com fallback controlado para registros legados.
- Gate de corte CAPI implementado em 2026-07-12 como leitura exclusiva do backoffice. O backend reconcilia `conversation_started`, `qualified_lead` e `purchase` somente a partir do PostgreSQL: separa eventos aceitos, operacionais, historicos, descartados e falhas tecnicas; confirma conversoes unicas vinculadas; contabiliza repeticoes e pendencias; verifica os estados de entrega; e valida conexao Meta + destino Pixel/Pagina. Conversoes de registros removidos sao excluidas pelo vinculo ativo da ingestao, portanto um lead apagado nao mantem o gate bloqueado.
- O painel mostra os estados `Coletando`, `Bloqueado`, `Pronto para corte` e `CAPI ativo`, com motivos objetivos para cada bloqueio. Esta etapa nao consulta o MySQL durante a pagina, nao possui botao de corte e nao altera `shadowMode`, `capiSendEnabled`, workflows n8n ou envios Meta. O proximo checkpoint e observar o gate real da Barbieri depois do deploy; somente com os tres eventos reconciliados e aprovacao explicita sera feito o corte controlado.
- Verificacao local do gate CAPI em 2026-07-12: 468 testes da API, 105 do web e 55 compartilhados passaram, totalizando 628; `pnpm lint`, typechecks, build de producao do web, build Nest isolado da API, `prisma validate` e `git diff --check` tambem passaram. O prebuild completo da API encontrou apenas o lock local `EPERM` da DLL Prisma por um processo de desenvolvimento ativo; o client havia sido gerado com sucesso antes do lock e a compilacao Nest posterior passou.
- Primeira observacao do gate Barbieri em producao: Meta e destino estavam configurados, havia 37 conversas operacionais e zero pendencias, mas 5 `qualified_lead` e 1 `purchase` antigos com `ExternalLeadNotMatched` apareciam como eventos reais/rejeitados e bloqueavam o corte. Esses seis registros sao os descartes intencionais da limpeza de leads artificiais, nao falhas do fluxo atual. A classificacao foi corrigida para mante-los auditaveis como `Descartados`, exclui-los das amostras reais e reservar `Falhas`/estado `Bloqueado` para rejeicoes tecnicas. Sem uma nova amostra aceita de Qualificado e Compra, o estado correto passa a ser `Coletando`.
- Bloco 4C de auditoria Meta implementado em 2026-07-12. A nova rota customer-facing `/events` usa `GET /reports/conversions/audit` com periodo local de `America/Sao_Paulo`, filtros por evento/estado/origem, paginacao e totais sobre todo o filtro. A API agrupa os estados como Enviado, Na fila, Bloqueado, Falhou, Historico e Descartado; enriquece cada pagina em lote com lead, telefone, campanha, conjunto e anuncio; e substitui mensagens/payloads brutos do provider por resumos seguros. A sidebar ganhou `Eventos Meta`, a rota entrou no middleware autenticado e a UI foi validada em 1440 px e 390 px sem overflow de pagina ou paginacao cortada.
- Verificacao do Bloco 4C: 55 testes compartilhados, 471 da API e 109 do web passaram, totalizando 635. `pnpm lint`, build de producao Next e compilacao Nest isolada passaram. O build agregado encontrou apenas o lock local conhecido `EPERM` da DLL Prisma porque a API de desenvolvimento estava ativa; nenhuma falha de codigo permaneceu. O bloco nao altera `shadowMode`, `capiSendEnabled`, workflows n8n ou envios Meta, e o gate Barbieri continua coletando a primeira amostra real aceita de QualifiedLead e Purchase.
- Bloco 4B de Configuracoes implementado em 2026-07-12. A migration `20260712213000_funnel_stage_configuration` persiste por workspace a ordem, visibilidade, nome exibido, produto/servico, moeda e valor medio de cada evento Meta. `GET/PUT /conversion-rules/funnel` expoe o contrato com permissao owner/admin e auditoria `funnel_configuration.updated`; gatilhos por palavra-chave/etiqueta continuam separados da jornada visual.
- Valores reais recebidos do conector continuam prioritarios. Na ausencia deles, o evento usa primeiro o valor especifico da regra e depois o valor medio configurado para o evento no workspace, sempre copiando o valor para o evento novo com `valueSource=configured_average`; alteracoes futuras nao reescrevem historico. A ingestao externa de Purchase usa a mesma precedencia antes do fallback legado do conector.
- Visao Geral e Relatorios agora recebem etapas dinamicas ordenadas e visiveis. As tabelas de campanha, conjunto e anuncio substituem colunas fixas por nomes configurados pelo cliente, preservando conversas Meta, total recebido, organico, receitas e ROAS. A tela Configuracoes ganhou edicao da jornada e de produto/valor das regras sem campo manual de token Meta para o cliente.
- Verificacao do Bloco 4B: 56 testes compartilhados, 478 da API e 109 do web passaram, totalizando 643; `pnpm lint`, `prisma validate`, compilacoes de shared/Nest e build de producao Next passaram. Configuracoes e Relatorios foram inspecionados em 1440 px e 390 px com dados preenchidos, sem overflow horizontal; os cards de conta/equipe usam duas colunas no desktop e uma no mobile. O bloco nao altera workflows n8n, `shadowMode`, `capiSendEnabled` nem o gate automatico da Barbieri.
- O product owner aprovou o Bloco 4B para commit e deploy em 2026-07-12. O checkpoint de producao e aplicar a migration do funil, confirmar Configuracoes/Relatorios e somente entao preencher os nomes, produtos e valores medios reais da Barbieri.
- Ordem de trabalho atualizada por decisao do product owner em 2026-07-12: antes do Bloco 5 sera executado o Bloco 4.5, uma revisao visual integral de todas as rotas existentes da plataforma e do backoffice. A auditoria inventaria telas e estados, registra achados por severidade, corrige um grupo de paginas por vez e exige evidencias em 1440 px e 390 px, testes e aprovacao explicita antes da productizacao dos conectores. Durante essa revisao, os dados reais de conversao da Barbieri estao sendo preenchidos e o gate CAPI continua coletando amostras automaticas em modo sombra, sem alteracao dos envios n8n.
- Primeira fatia do Bloco 4.5 concluida no shell compartilhado em 2026-07-12: o subtitulo `Telemetry OS` foi removido; a sidebar desktop recolhida usa icones Lucide completos para recolher/expandir e sair, sem texto cortado; e o mobile ganhou cabecalho compacto com hamburger e drawer lateral que fecha por botao, backdrop, navegacao ou `Escape`, bloqueando a rolagem do fundo enquanto aberto. A verificacao passou com 112 testes web, typecheck e build Next; a inspecao automatizada em 1440 x 1000 e 390 x 844 confirmou ausencia de overflow, botao de saida contido e estados aberto/fechado corretos. Depois da aprovacao visual deste shell, a proxima pagina do Bloco 4.5 e Visao Geral.
- Revisao da Visao Geral do Bloco 4.5 implementada em 2026-07-13: a grade de barras foi substituida por um funil de conversao visual inspirado na referencia aprovada do Renato, com segmentos curvos proporcionais e taxas entre etapas no desktop e uma jornada vertical dedicada no mobile. As etapas, nomes e ordem continuam vindo do relatorio dinamico do workspace. `ROAS com recompra` agora aparece somente quando o periodo possui recompra ou receita de recompra, e o KPI de compras nao exibe mais `0 recompra` quando houve apenas primeira compra. Os 113 testes web e o typecheck passaram; a inspecao automatizada em 1440 x 1000 e 390 x 844 confirmou ausencia de overflow e rotulos legiveis. Apos aprovacao visual, a proxima pagina do Bloco 4.5 e Leads.
- Visao Geral ganhou recorte global por periodo, Business Manager e conta de anuncio em 2026-07-13. Os seletores de BM/conta aparecem apenas quando existe mais de uma opcao ativa e o mesmo recorte governa KPIs, funil, grafico e links para Relatorios. O novo comparativo diario `Conversas Meta x conversas reais` usa Insights Meta sincronizados com `time_increment=1`, persistidos em uma serie densa de `MetaCampaignDailyInsight` com dias confirmados em zero, e conversas reais agrupadas pelo primeiro registro do lead/evento no dia local. O grafico so e liberado quando todos os dias e campanhas do recorte possuem cobertura, sem apresentar historico parcial como completo. Apos o deploy da migration `20260713160000_meta_campaign_daily_insights`, deve-se executar `Sincronizar Meta` no periodo desejado para preencher o historico diario. A rodada completa passou com 56 testes shared, 482 da API e 114 do web; builds de producao de API e web tambem passaram.
- Correcao de fuso do comparativo diario e da busca de Leads implementada em 2026-07-13. A view Kinbox projeta `data_criacao` como meia-noite sem offset; a API acrescentava `Z`, convertendo `13/07 00:00` em `12/07 21:00` em Sao Paulo. Datas-calendario de `first_message_at`, qualificacao e compra agora usam o fuso do conector, enquanto `updated_at` e eventos continuam UTC. Visao Geral, Relatorios, Eventos Meta e Leads compartilham a mesma janela inclusiva em `America/Sao_Paulo`, e a serie diaria deixou de depender de `includeSummary`. Depois do deploy nao ha nova migration; e necessario executar uma vez `Reimportar leads` no conector Barbieri para corrigir os registros historicos ja persistidos. Regressao automatizada cobre a virada de 12/07 para 13/07 e o fim local do dia. A suite completa passou com 484 testes da API, compilacao TypeScript direta e build Nest isolado; o pretypecheck agregado encontrou apenas o lock local conhecido `EPERM` da DLL Prisma por um processo de desenvolvimento ativo.
- Revisao do detalhe de Leads do Bloco 4.5 implementada em 2026-07-13. O topo agora apresenta a hierarquia Campanha -> Conjunto -> Anuncio em uma unica superficie de atribuicao, com tipografia operacional, IDs secundarios e o ultimo evento separado; o criativo atribuido ganhou painel proprio com miniatura preservada sem corte e acao `Ver no Instagram`, sem expor a URL bruta na interface. Os blocos Rastreamento, Eventos Pixel/CAPI e Webhooks usam cabecalhos com respiro consistente e uma unica superficie de dados, removendo o efeito de card aninhado. A migration PostgreSQL `20260713220000_lead_creative_thumbnail` persiste `ctwaThumbnailUrl`; o SQL externo `docs/setup/external-mysql/migrations/20260713_add_lead_creative_thumbnail.sql` expoe o `thumbnail` ja gravado pela Kinbox como `thumbnail_url`. A leitura MySQL e retrocompativel com a view antiga, e URLs fora de `http`/`https` sao descartadas. Depois do deploy, aplicar os dois SQLs na ordem normal e executar `Reimportar leads` para preencher miniaturas historicas. A migration local foi aplicada e o schema ficou atualizado; passaram 56 testes shared, 487 da API e 114 do web, total de 657, alem de typecheck completo, build Next e compilacao Nest direta. A inspecao em 1440 x 1000 e 390 x 844 confirmou hierarquia legivel, criativo responsivo e ausencia de overflow horizontal; o build agregado encontrou somente o lock local conhecido `EPERM` da DLL Prisma porque a API de desenvolvimento estava ativa.

## Perguntas Abertas

1. Definir dominios finais de app/API, criando um subdominio novo para a API deste projeto, e decidir se PostgreSQL/Redis ficarao no Dokploy ou em servicos gerenciados.
2. Evoluir seguranca operacional da autenticacao propria: politicas de rate limit, auditoria de login, rotacao/expiracao refinada de sessoes e revisao de hardening antes de producao.
3. Validar em ambiente real o contrato Uazapi para eventos de etiqueta no WhatsApp Business e ajustar o adapter conforme payload oficial observado.
4. Validar detalhes do app Meta existente: app id, permissoes, produtos ativos, URLs de callback, modo live/dev e limites.
5. Confirmar se a marca d'agua fixa deve aparecer para todos os clientes, somente em planos especificos ou ficar fora do SaaS final.
6. Detalhar planos por numero de instancias WhatsApp, ciclo de cobranca Asaas, cobranca antecipada de nova instancia, inadimplencia, NF, split percentual e backoffice interno de split.
7. Detalhar convites para membros do workspace e matriz inicial de permissoes para owner/admin/member.
8. Definir quando ativar IA de analise de conversa e quais provedores/modelos usar no futuro.
9. Observar o gate CAPI da Barbieri em producao, corrigir qualquer bloqueio real e aprovar os totais dos tres eventos. Somente depois desativar os envios Meta legados do n8n e habilitar o CAPI WppTrack em um corte controlado e reversivel.

## Regras para Futuras Conversas

- Leia este `Projeto.md` antes de trabalhar no projeto.
- Nao reintroduzir a camada de agencias/clientes sem decisao explicita do usuario.
- Manter relatorios como area central do produto.
- Manter o design system WppTrack como fonte visual.
- Atualizar este arquivo sempre que houver decisoes importantes de produto, arquitetura, escopo ou implementacao.
