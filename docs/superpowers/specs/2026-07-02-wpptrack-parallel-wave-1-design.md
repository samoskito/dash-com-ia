# WppTrack Parallel Wave 1 Design Spec

Data: 2026-07-02

## Objetivo

Avancar a plataforma em paralelo apos a fundacao da Fase 1, mantendo velocidade sem criar conflitos de arquitetura. Esta rodada deve melhorar a experiencia visual, iniciar autenticacao/workspaces, preparar integracoes externas e desenhar a base de diagnosticos reais.

## Estrategia Aprovada

A execucao sera paralela por trilhas independentes, com fronteiras de arquivos explicitas:

1. Trilha A: Paridade visual WppTrack Design System.
2. Trilha B: Auth + Workspaces.
3. Trilha C: Scaffolds de integracoes Meta, Uazapi e Asaas.
4. Trilha D: Especificacao tecnica de Diagnosticos + Logs.

As trilhas nao devem disputar os mesmos arquivos. Quando houver risco de conflito, a trilha deve criar arquivos isolados e deixar a integracao central para uma etapa posterior.

## Trilha A: Paridade Visual WppTrack

Objetivo: substituir o visual simplificado da fundacao por uma experiencia mais fiel ao design system `Telemetria Noturna`.

Escopo:

- Portar tokens visuais reais para o app Next.
- Refatorar shell, sidebar, cards, tabelas, login, backoffice e paginas principais.
- Manter a navegacao existente.
- Nao alterar contratos de dominio, API, Prisma ou rotas backend.

Arquivos preferenciais:

- `apps/web/src/styles/globals.css`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/app/**`
- `apps/web/src/mock/**`
- `apps/web/tests/**`

Resultado esperado:

- App navegavel com aparencia escura, tecnica, densa, precisa e orientada a dados.
- Layout coerente em desktop e mobile.
- Testes web atualizados para rotas e navegacao.

## Trilha B: Auth + Workspaces

Objetivo: iniciar autenticacao propria e estrutura multiusuario por workspace.

Escopo:

- Expandir schema Prisma com entidades de sessao, convite e token quando necessario.
- Criar contratos compartilhados para auth.
- Criar modulos NestJS iniciais para auth e workspace.
- Criar testes de regras de senha, login mockado, roles e isolamento basico.
- Manter Google OAuth como contrato/scaffold, sem conectar provedor real ainda.

Arquivos preferenciais:

- `apps/api/prisma/schema.prisma`
- `apps/api/src/auth/**`
- `apps/api/src/workspaces/**`
- `apps/api/test/auth*.test.ts`
- `apps/api/test/workspace*.test.ts`
- `packages/shared/src/schemas/auth.ts`
- `packages/shared/src/schemas/workspace.ts`
- `packages/shared/tests/**`

Resultado esperado:

- Base real para email/senha.
- Contratos para Google OAuth futuro.
- Workspace e roles testados em nivel de servico/contrato.

## Trilha C: Scaffolds de Integracoes

Objetivo: preparar arquitetura plugavel para Meta, Uazapi e Asaas sem depender de credenciais reais.

Escopo:

- Criar contratos e adapters base.
- Criar clientes mockaveis para Meta, Uazapi e Asaas.
- Criar DTOs/erros/status comuns.
- Criar endpoints ou servicos internos apenas quando nao exigirem banco.
- Nao modificar Prisma nesta rodada.
- Evitar alterar `AppModule` se isso causar conflito com Auth; os modulos podem ficar criados e testados isoladamente.

Arquivos preferenciais:

- `apps/api/src/integrations/**`
- `apps/api/test/integrations*.test.ts`
- `packages/shared/src/schemas/integrations.ts`
- `packages/shared/src/statuses.ts`
- `packages/shared/tests/**`

Resultado esperado:

- Camada tecnica clara para plugar Meta OAuth, Uazapi e Asaas em planos seguintes.
- Testes de contrato e normalizacao de erros.

## Trilha D: Diagnosticos + Logs

Objetivo: desenhar a proxima etapa de logs operacionais e Central de Diagnostico sem disputar Prisma nesta rodada.

Escopo:

- Especificar entidades de log e eventos diagnosticos.
- Especificar telas do backoffice de diagnostico.
- Especificar fluxo de webhooks/jobs/eventos para debug por workspace.
- Especificar regras de retentativa segura e auditoria.
- Nao implementar schema Prisma nesta rodada.

Arquivos preferenciais:

- `docs/superpowers/specs/2026-07-02-wpptrack-diagnostics-logs-design.md`
- opcionalmente atualizar `Projeto.md` com resumo aprovado.

Resultado esperado:

- Spec pronta para uma fase posterior de implementacao de diagnosticos reais.

## Coordenacao

- Trilha A pode rodar em paralelo com B, C e D porque toca principalmente frontend.
- Trilha B e D nao devem implementar Prisma simultaneamente; D fica como spec nesta rodada.
- Trilha C nao deve modificar Prisma e deve evitar `AppModule` se B tambem estiver alterando bootstrap da API.
- Cada trilha deve commitar separadamente.
- Depois das trilhas, executar verificacao integrada: `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Fora de Escopo Desta Rodada

- Conectar Meta OAuth real.
- Conectar Uazapi real.
- Conectar Asaas real.
- Rodar migrations reais se Docker/Postgres continuarem indisponiveis.
- Implementar chat/inbox WhatsApp.
- Implementar marca d'agua fixa no painel do cliente final.

## Criterios de Sucesso

- Frontend visualmente mais proximo do design system.
- Auth/workspace tem base testada.
- Integracoes possuem camada de adapter e contratos testados.
- Diagnosticos tem spec tecnica pronta.
- Testes, typecheck e build continuam passando no que nao depende de Docker local.
