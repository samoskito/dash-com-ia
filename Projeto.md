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
- Google OAuth recebeu scaffold inicial: `POST /auth/google/start` retorna `configure_env` quando faltam `GOOGLE_CLIENT_ID`/`GOOGLE_REDIRECT_URI`, ou monta a URL de autorizacao do Google com scopes `openid email profile` sem chamar servico externo.
- Recuperacao de senha e verificacao de email receberam scaffold persistente: `AuthActionToken` no Prisma, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/email/verification/start` e `POST /auth/email/verification/confirm`. Tokens ficam hasheados no banco e so sao retornados em desenvolvimento/controlado com `AUTH_EXPOSE_DEV_TOKENS=true`.
- Wave 2 backend executada em 2026-07-02 com plano em `docs/superpowers/plans/2026-07-02-wpptrack-wave-2-real-saas-backend.md`.
- Workspace API real adicionada: `GET /workspaces/current`, `GET /workspaces/current/members` e `POST /workspaces/current/invites`.
- Convites de workspace agora possuem aceite autenticado: `POST /workspaces/invites/accept` valida token, email do usuario convidado, status pendente e expiracao, cria `WorkspaceMember` e marca o convite como `accepted`.
- Diagnosticos persistentes implementados com Prisma/API: `DiagnosticEvent`, `WebhookLog`, `IntegrationLog`, `ConversionEventLog`, `JobAttempt` e `AuditLog`; endpoints iniciais em `/backoffice/diagnostics/events`.
- API de integracoes exposta sem credenciais externas: `GET /integrations/health`, `GET /integrations/meta/start`, `GET /integrations/uazapi/start` e `GET /integrations/asaas/status`.
- Billing/ativacao de instancia WhatsApp scaffoldado: `GET /billing/whatsapp-instance/quote` e `POST /billing/whatsapp-instance/checkout`; checkout cria instancia `pending_payment`, cobranca pendente e ativacao pendente, sem liberar uso antes de webhook/pagamento futuro.
- Migrations reais adicionais aplicadas no Postgres local: `20260702034254_diagnostics_logs` e `20260702034847_billing_activation`.
- Frontend parcialmente conectado ao backend: tela de login/cadastro chama `/auth/login` e `/auth/register`; pagina de integracoes tenta ler `/integrations/health`; backoffice tenta ler eventos diagnosticos reais com fallback visual.
- Frontend agora possui middleware de protecao para `/overview`, `/leads`, `/reports`, `/integrations`, `/settings` e `/backoffice`, exigindo cookie `wpptrack_session`; o shell possui acao de logout chamando `/auth/logout`.
- Webhooks publicos iniciais adicionados para registrar rastros operacionais: `POST /webhooks/uazapi`, `POST /webhooks/asaas` e `POST /webhooks/meta`; eles gravam `WebhookLog` sanitizado e `DiagnosticEvent` vinculado.
- Regras de conversao configuraveis implementadas em 2026-07-02: backend Prisma/API para gatilhos por `keyword` e `whatsapp_label`, endpoints `/conversion-rules`, `/conversion-rules/:id` e `/conversion-rules/evaluate`, schema compartilhado e tela `Configuracoes` lendo regras reais com fallback visual.
- Migration real adicional aplicada no Postgres local: `20260702040655_conversion_rules`.
- Verificacao apos regras de conversao: `pnpm test` passou com API 17 arquivos/44 testes, shared 16 testes e web 3 arquivos/8 testes; `pnpm typecheck` passou; `prisma migrate status` indicou schema atualizado com 5 migrations.
- Processamento inicial de webhook Asaas implementado: `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` ou status `RECEIVED`/`CONFIRMED` busca a cobranca por `externalChargeId` ou `chargeId` local, marca `PaymentCharge` como `paid`, ativa `WhatsappInstanceActivation` e muda a `WhatsappInstance` para `active`.
- A criacao real da cobranca no Asaas ainda depende das credenciais/contrato final; o fluxo interno de ativacao pos-pagamento ja esta preparado e testado.
- Webhook Uazapi agora avalia regras de conversao quando recebe `x-workspace-id`: extrai texto de mensagem e etiquetas comuns do payload, executa `/conversion-rules` internamente e cria `ConversionEventLog` para regras encontradas, com status `ready_to_send` quando ha `pixelId` e `adId`, ou `pending_meta_context` quando falta contexto Meta.
- Backoffice de split recebeu API inicial: `GET /backoffice/split/receivers`, `POST /backoffice/split/receivers` e `PATCH /backoffice/split/receivers/:id`, usando `SplitReceiver` para nome, wallet Asaas, email, percentual em basis points e status ativo.
- Rodada Paralela 1 executada e revisada: visual WppTrack/Telemetria Noturna aplicado ao web, Auth/Workspaces iniciado, scaffolds de integracoes Meta/Uazapi/Asaas criados e spec de Diagnosticos/Logs adicionada.
- Verificacao da Rodada Paralela 1: `pnpm test`, `pnpm typecheck`, `pnpm build`, `prisma generate` e `prisma validate` passaram. O bloqueio anterior do Docker Desktop Linux engine foi resolvido quando o Docker Desktop foi aberto.
- Spec e plano da Rodada Paralela 1: `docs/superpowers/specs/2026-07-02-wpptrack-parallel-wave-1-design.md` e `docs/superpowers/plans/2026-07-02-wpptrack-parallel-wave-1-implementation.md`.
- Servidor local usado para visualizar: `http://127.0.0.1:5174/`.
- Repositorio inicial ja possui commits da fundacao da Fase 1.
- Diagnosticos/logs operacionais possuem spec dedicada em `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`; a primeira implementacao Prisma/API ja existe, mas retry seguro, raw payload autorizado e telas detalhadas ainda ficam para ondas posteriores.

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
- Implementacao atual cobre email/senha completo, recuperacao de senha, verificacao de email e inicio do Google OAuth; callback/troca de code por token e criacao/login de usuario Google ficam para a etapa em que as credenciais e callback publico estiverem definidos.
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
- Implementacao atual ja cobre o controle interno desse fluxo: checkout local deixa instancia/cobranca/ativacao pendentes e webhook Asaas confirmado ativa a instancia. Falta plugar a criacao real da cobranca/checkout no Asaas.
- Evitar modelo "usa agora e paga depois", para reduzir risco de inadimplencia/calote.
- O valor por instancia deve ser previsivel para o usuario, por exemplo: `quantidade de instancias ativas x valor fixo por instancia`.
- Split Asaas: sera **percentual**, com contas/recebedores fixos definidos pela plataforma para socios do projeto. Usuarios finais nao configuram split.
- Deve existir uma area interna/backoffice para os donos do SaaS, invisivel para usuarios finais.
- No backoffice interno, os donos do SaaS poderao configurar as contas recebedoras do split Asaas e seus percentuais.
- O backoffice de split deve permitir adicionar/remover socios/recebedores e ajustar percentuais quando houver mudanca societaria.
- Implementacao atual ja possui API para listar, criar e atualizar recebedores de split; falta ligar isso em tela backoffice visual e, depois, aplicar os recebedores na criacao real das cobrancas Asaas.
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
- Permitir acao de reenfileirar/tentar novamente quando for seguro.
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
- Implementacao atual ja permite criar, listar, atualizar e avaliar regras ativas sem ainda enviar eventos ao Meta. O envio real ao Pixel/CAPI continua pendente da etapa de Meta OAuth/Pixel e da resolucao de lead/ad_id.
- Webhooks Uazapi ja conseguem aplicar as regras e registrar logs de conversao internos. Essa etapa ainda nao envia ao Meta; ela prepara a fila/logica para o futuro worker de Pixel/CAPI.
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

Proximo passo operacional:

- Continuar a proxima rodada com: Google OAuth, recuperacao/verificacao de email, tela backoffice de split, OAuth Meta real, envio Pixel/CAPI e telas detalhadas de diagnostico/retry.

## Perguntas Abertas

1. Detalhar ambientes, dominios, variaveis e pipeline de deploy para Vercel + VPS/Dokploy.
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
