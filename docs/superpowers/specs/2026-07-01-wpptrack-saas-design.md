# WppTrack SaaS - Design Spec

Data: 2026-07-01

## 1. Objetivo

Transformar o design system/prototipo WppTrack em um SaaS funcional, robusto e orientado ao cliente final. O produto nao sera um painel para agencias nem tera a aba `Clientes` no painel do usuario final.

O WppTrack deve permitir que uma empresa conecte WhatsApp, Meta Ads e Pixel para acompanhar a jornada:

`anuncio -> clique -> WhatsApp -> lead -> conversa -> conversao -> evento enviado ao Pixel/Meta Ads`

O valor principal do produto e unir trafego, leads e conversoes em relatorios integrados, ajudando o usuario a entender quais campanhas, conjuntos e anuncios geram conversas reais, leads reais, leads qualificados e compras.

## 2. Decisoes Aprovadas

- Produto para cliente final, nao para agencias.
- Remover a aba `Clientes` do painel do cliente final.
- Plataforma robusta desde o inicio, sem abordagem de MVP enxuto.
- Prioridade de produto: relatorios fortes desde o inicio.
- Relatorios devem cruzar trafego + leads + conversoes desde a primeira versao robusta.
- Fonte de dados de trafego: Meta Ads real via OAuth desde o inicio.
- Usar app Meta existente do usuario, ja criado e operando em outro SaaS. Se a validacao tecnica mostrar conflito de callback, permissoes ou ambiente, criar uma configuracao/app separado para o WppTrack mantendo o mesmo desenho OAuth.
- WhatsApp por arquitetura de provedores.
- Primeiro provedor WhatsApp operacional: Uazapi.
- WhatsApp Cloud API oficial deve ficar mapeada para plugar depois.
- Stack: Next.js + NestJS.
- Banco e filas: PostgreSQL + Prisma + BullMQ/Redis.
- Deploy: Next.js na Vercel; NestJS, PostgreSQL, Redis e workers em VPS/Dokploy.
- Conta: workspace/empresa com multiplos usuarios.
- Auth propria, sem Clerk/Auth0.
- Login: email/senha e Google OAuth.
- Papeis iniciais: `owner`, `admin`, `member`, com arquitetura preparada para permissoes granulares.
- IA de analise de conversa fica preparada, mas desligada/fora do foco inicial.
- Assinatura desde o inicio via Asaas.
- Cobranca por numero de instancias WhatsApp conectadas, nao por volume de conversas/leads.
- Nova instancia WhatsApp so e liberada apos pagamento confirmado.
- Split Asaas percentual, configurado em backoffice interno pelos donos da plataforma.
- Backoffice interno B+: financeiro/split, gestao de workspaces/clientes e Central de Diagnostico.
- Abordagem de construcao: esqueleto navegavel completo + motor real por tras.

## 3. Arquitetura Geral

A plataforma tera dois produtos dentro do mesmo ecossistema:

- Painel do cliente final.
- Backoffice interno dos donos do SaaS.

Eles compartilham autenticacao, API, banco, filas e integracoes, mas possuem navegacao e permissoes separadas. Usuarios finais nao veem split, logs globais, outros workspaces ou diagnostico interno da plataforma.

### Frontend

- Next.js hospedado na Vercel.
- Usa o design system WppTrack copiado para `wpptrack-design-system/`.
- Primeiro entrega uma experiencia navegavel completa:
  - Visao geral.
  - Leads.
  - Relatorios.
  - Integracoes.
  - Configuracoes.
  - Backoffice interno.
- Dados temporarios/mocks podem existir na fase visual, mas devem seguir contratos proximos aos DTOs reais e ser explicitamente temporarios.

### Backend

- NestJS hospedado em VPS/Dokploy.
- PostgreSQL com Prisma.
- Redis/BullMQ para jobs.
- Workers no mesmo ambiente do backend.
- Webhooks externos apontam para a API publica do backend.
- O backend e o unico componente que fala diretamente com credenciais Meta, Uazapi e Asaas.

Regra central: frontend exibe estado e dispara intencoes; backend executa, registra, audita e confirma.

## 4. Painel do Cliente Final

### 4.1 Visao Geral

Objetivo: ser o cockpit da operacao.

Conteudo:

- KPIs:
  - Conversas iniciadas.
  - Rastreadas.
  - Nao rastreadas.
  - Conversoes enviadas.
  - Taxa de rastreio.
  - Custo por conversa.
  - Investimento.
  - ROAS atribuido.
- Grafico de funil:
  - Anuncio.
  - Clique/conversa Meta.
  - Conversa real.
  - `LeadSubmitted`.
  - `QualifiedLead`.
  - `Purchase`.
- Qualidade do rastreio.
- Alertas de integracao.
- Status de eventos enviados ao Pixel.
- Botao de refresh manual quando a sincronizacao permitir.

Nao tera filtros de clientes.

### 4.2 Leads

Objetivo: listar e investigar leads recebidos pelo WhatsApp.

Lista:

- Busca por nome e telefone usando comportamento "contem".
- Filtros por:
  - Periodo.
  - Campanha.
  - Conjunto.
  - Anuncio.
  - Status.
  - Rastreado/nao rastreado.
  - Evento enviado.
  - Etiqueta.
- Colunas:
  - Nome.
  - Telefone.
  - Status.
  - Origem.
  - Campanha/conjunto/anuncio.
  - UTM/CTWA.
  - Etiquetas.
  - Eventos.
  - Data/hora.
- Botao de refresh manual.

Detalhe do lead:

- Dados de identidade.
- Origem e jornada.
- `ad_id`, CTWA, UTMs e dados de atribuicao.
- Campanha, conjunto e anuncio relacionados.
- Historico de eventos.
- Palavras-chave detectadas.
- Etiquetas aplicadas.
- Status do envio ao Pixel.
- Conversa como contexto/rastro, nao como inbox de chat.

### 4.3 Relatorios

Objetivo: ser o nucleo forte do produto.

Os relatorios cruzam:

- Metricas Meta Ads.
- Leads reais vindos do WhatsApp.
- Eventos enviados ao Pixel.

Drill-down:

`campanha -> conjunto/publico -> anuncio/criativo -> leads -> eventos Pixel`

Metricas obrigatorias na UI de relatorios:

- Investimento.
- Conversas iniciadas Facebook/Meta.
- Custo por conversas iniciadas Facebook/Meta.
- Conversa real, ou seja, lead que entrou em contato.
- Custo por conversa real.
- `LeadSubmitted`.
- Custo por `LeadSubmitted`.
- `QualifiedLead`.
- Custo por `QualifiedLead`.
- `Purchase`.
- Custo por `Purchase`.
- Conversoes enviadas.
- Falhas de envio.
- Taxa de rastreio.
- ROAS atribuido.
- Comparacao entre periodos.

Quando algum dado depender de permissao Meta, atraso de sincronizacao ou ausencia de atribuicao, a UI deve mostrar o motivo em vez de ocultar a metrica silenciosamente.

Acoes operacionais, se o app Meta permitir:

- Ativar/desativar campanha.
- Ativar/desativar conjunto.
- Ativar/desativar anuncio.
- Alterar orcamento.
- Refresh manual de metricas.

Essas acoes exigem confirmacao visual, permissao adequada e log/auditoria.

### 4.4 Integracoes

Objetivo: conectar e monitorar WhatsApp, Meta e Pixel.

WhatsApp:

- Primeiro provedor: Uazapi.
- Cloud API oficial prevista para futuro.
- Estados:
  - Conectado.
  - Desconectado.
  - Sincronizando.
  - Erro.
  - Aguardando pagamento.
  - Precisa reconectar.

Meta/Pixels:

- OAuth Meta desde o inicio.
- Usar app Meta existente se viavel.
- Conectar:
  - BM.
  - Conta de anuncio.
  - Pixel.
  - Pagina, quando necessario.
- Mostrar status de saude da integracao.
- Mostrar ultimas sincronizacoes.

### 4.5 Configuracoes

Escopo enxuto, sem configuracoes de agencia.

Itens:

- Perfil da empresa.
- Usuarios e convites.
- Papeis.
- Preferencias.
- Mapeamento de eventos.
- Regras de palavra-chave.
- Regras de etiqueta.
- Versao da API Meta, quando necessario controlar migracoes.
- Visualizacao da BM/conta de anuncio/pixel/pagina conectados.
- Area futura para IA/OpenRouter, sem ativacao inicial.

## 5. Gatilhos de Conversao

O produto deve permitir disparar eventos para Meta por dois caminhos:

### Palavra-chave

O backend analisa mensagens recebidas pelo webhook da Uazapi. Quando encontra uma palavra-chave configurada, dispara o evento Meta associado.

### Etiqueta WhatsApp

O usuario pode configurar etiqueta do WhatsApp Business como gatilho de evento.

Direcao tecnica:

- Uazapi sera o primeiro provedor a suportar etiquetas.
- Documentacao publica/colecao Postman da Uazapi v2 possui secao "Chats, Bloqueios, Contatos e etiquetas", incluindo recursos como buscar etiquetas, editar etiqueta e etiquetar chat.
- Antes da implementacao final, validar se a Uazapi envia webhook quando etiqueta e adicionada/removida.
- Se nao houver webhook de etiqueta, usar sincronizacao periodica, refresh manual ou job de verificacao de alteracoes recentes.
- Na futura WhatsApp Cloud API oficial, nao assumir suporte a etiquetas nativas do WhatsApp Business App sem confirmacao. Se necessario, usar tags internas do WppTrack.

Regra de envio:

- Usuario escolhe gatilho.
- Usuario escolhe evento Meta:
  - `LeadSubmitted`.
  - `QualifiedLead`.
  - `Purchase`.
  - Outros eventos suportados.
- Backend identifica o lead.
- Backend busca `ad_id`, campanha/conjunto/anuncio e pixel.
- Se houver mais de uma BM/conta no futuro, backend valida a qual conta o anuncio pertence.
- Backend envia evento ao Pixel.
- Backend registra sucesso/erro.

## 6. Backoffice Interno

Area separada e invisivel para clientes finais.

Escopo B+ aprovado:

- Financeiro da plataforma.
- Planos e assinaturas.
- Cobrancas Asaas.
- Configuracao de recebedores e percentuais de split.
- Gestao de workspaces/clientes.
- Status de assinatura por workspace.
- Instancias WhatsApp conectadas por workspace.
- Status de integracoes Meta/Pixels e WhatsApp.
- Bloqueio/desbloqueio operacional.
- Central de Diagnostico.

### Central de Diagnostico

Objetivo: permitir que o dono da plataforma investigue problemas pelo frontend interno sem abrir banco de dados ou terminal.

Deve mostrar:

- Webhooks recebidos por workspace, integracao, tipo e periodo.
- Eventos enviados ao Pixel.
- Eventos com sucesso.
- Eventos com erro.
- Respostas da Meta.
- Respostas da Uazapi.
- Eventos do Asaas.
- Execucoes de automacao/extracao Meta com sucesso/erro.
- Mudancas de campanha/conjunto/anuncio com sucesso/erro.
- Jobs BullMQ.
- Tentativas.
- Payload resumido.
- Resposta externa.
- Proximo retry.

Acoes:

- Reenfileirar/tentar novamente quando for seguro.
- Bloquear/desbloquear workspace.
- Ver detalhes tecnicos sob demanda.

Acoes sensiveis exigem confirmacao e auditoria.

## 7. Cobranca, Assinatura e Split

Gateway: Asaas.

Uso:

- Assinatura recorrente.
- Cobrancas.
- NF automatica quando aplicavel.
- Split percentual.

Modelo de cobranca:

- Cobrar por numero de instancias WhatsApp conectadas.
- Nao limitar por conversas/leads no primeiro momento.
- Valor previsivel:

`valor mensal = instancias ativas x valor fixo por instancia`

Ativacao de instancia:

- Usuario clica para adicionar instancia.
- Frontend mostra valor fixo e impacto.
- Frontend solicita ao backend.
- Backend cria cobranca/checkout no Asaas.
- Usuario paga.
- Asaas envia webhook.
- Backend valida pagamento.
- Instancia sai de `pending_payment` para `active`.
- Somente instancia ativa pode conectar WhatsApp.

Evitar o modelo "usa agora e paga depois".

Split:

- Percentual.
- Recebedores/socios configurados no backoffice interno.
- Usuarios finais nao veem nem configuram split.
- Backoffice permite adicionar/remover recebedores e alterar percentuais.

## 8. Seguranca e Permissoes

Autenticacao propria:

- Email/senha.
- Google OAuth.
- Hash de senha.
- Sessao/refresh token.
- Recuperacao de senha.
- Verificacao de email.
- Revogacao de acesso.

Modelo de acesso:

- Workspace representa uma empresa final.
- Papeis:
  - `owner`.
  - `admin`.
  - `member`.
- Preparado para permissoes granulares futuras.

Permissoes iniciais:

- `owner`: assinatura, cobranca, equipe, integracoes criticas, configuracoes.
- `admin`: operacao, integracoes, relatorios, leads.
- `member`: operacao e relatorios conforme permissoes.

Separacao:

- Cliente final nao acessa backoffice interno.
- Donos da plataforma acessam backoffice com permissao especial.
- Tokens sensiveis nunca ficam no frontend.

## 9. Dados e Entidades Principais

Entidades conceituais:

- Usuario.
- Workspace.
- MembroWorkspace.
- ConviteWorkspace.
- Role/Permissao.
- ContaOAuth.
- Sessao/AuthToken.
- RecuperacaoSenha.
- IntegracaoWhatsApp.
- InstanciaWhatsApp.
- IntegracaoMeta.
- BM.
- ContaAnuncio.
- Pixel.
- PaginaMeta.
- Campanha.
- ConjuntoAnuncio/Publico.
- Anuncio/Criativo.
- Lead.
- Conversa/Mensagem.
- EtiquetaWhatsApp.
- EventoConversao.
- MapeamentoEvento.
- RegraPalavraChaveEvento.
- RegraEtiquetaEvento.
- DisparoEventoPalavraChave.
- DisparoEventoEtiqueta.
- SincronizacaoMeta.
- MudancaCampanhaMeta.
- Relatorio/Exportacao.
- AnaliseIAConversa, prevista para futuro.
- PlanoAssinatura.
- AssinaturaWorkspace.
- Cobranca/Pagamento.
- NotaFiscal.
- RecebedorSplit.
- ConfiguracaoSplit.
- SplitPagamento.
- AtivacaoInstanciaWhatsApp/CobrancaAtivacao.
- LogWebhook.
- LogIntegracao.
- LogEventoEnviado.
- LogExtracaoMeta.
- LogMudancaCampanha.
- TentativaJob.
- DiagnosticoEvento.
- AuditoriaAcao.

## 10. Experiencia Visual

Base visual: `wpptrack-design-system/`.

Direcao:

- B2B SaaS.
- Tecnico, claro e confiavel.
- Denso, mas legivel.
- Orientado a dados.
- Sem visual de agencia.
- Sem ranking de clientes no painel final.
- Sem linguagem de chatbot/disparo em massa.

Estados importantes:

- Conectado.
- Pendente de configuracao/sincronizacao.
- Erro.
- Sincronizando.
- Aguardando pagamento.
- Precisa reconectar.
- Evento enviado.
- Evento falhou.
- Reprocessando.

Diagnostico deve traduzir erros tecnicos em leitura humana, com detalhes tecnicos sob demanda.

Marca d'agua:

- Documento de metricas solicita marca d'agua fixa: "desenvolvido por Comunidade NOD - PalmUP - Dericson Calari e Samuel Choairy".
- Decisao visual ainda precisa confirmacao antes de implementar. Padrao da implementacao: nao exibir marca d'agua no painel do cliente final ate haver aprovacao explicita, pois isso afeta experiencia do cliente e possivel white-label.

## 11. Testes e Validacao

Areas criticas:

- Auth e permissoes.
- Isolamento por workspace.
- Webhooks Uazapi, Meta e Asaas.
- Idempotencia de webhooks.
- Gatilhos por palavra-chave.
- Gatilhos por etiqueta.
- Envio de eventos ao Pixel.
- Jobs BullMQ.
- Ativacao de instancia apenas apos pagamento confirmado.
- Reprocessamento seguro.
- Logs estruturados e diagnostico.
- Acoes Meta Ads sensiveis com permissao e auditoria.

Testes esperados:

- Unitarios para regras de negocio.
- Integracao para webhooks.
- E2E para fluxos principais.
- Testes de permissao por papel.
- Testes de idempotencia.
- Testes de renderizacao/estado do frontend quando telas forem implementadas.

## 12. Pendencias Para Plano de Implementacao

- Validar contrato real da Uazapi para webhook de mudanca de etiqueta.
- Validar permissoes do app Meta existente.
- Definir nomes finais e formulas das metricas.
- Confirmar regra visual da marca d'agua.
- Definir valores de planos/instancias.
- Definir comportamento de remocao de instancia no ciclo de cobranca.
- Detalhar pipeline de deploy Vercel + Dokploy.
- Detalhar matriz de permissoes owner/admin/member.
