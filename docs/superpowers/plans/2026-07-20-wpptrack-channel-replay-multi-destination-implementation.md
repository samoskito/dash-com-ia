# Replay por canal e multiplos destinos Meta - implementacao

## Wave 1 - Contratos e schema

- [x] Adicionar destinos permitidos por conta.
- [x] Adicionar atribuicao de destino por anuncio.
- [x] Adicionar canal opcional ao lote de replay.
- [x] Preservar os campos e lotes legados.

## Wave 2 - Roteamento Meta

- [x] Coletar hints de Pixel/Dataset e Pagina por anuncio.
- [x] Reconciliar uma correspondencia automatica unica.
- [x] Manter atribuicoes manuais.
- [x] Bloquear resolucoes ausentes ou ambiguas.

## Wave 3 - Operacao

- [x] Expor multiplos destinos por conta em Integracoes.
- [x] Expor atribuicao manual por anuncio.
- [x] Mostrar elegibilidade por canal no replay.
- [x] Persistir e aplicar o canal escolhido no canario.

## Wave 4 - Verificacao

- [x] Testes de isolamento entre workspaces.
- [x] Testes de regressao do destino legado.
- [x] Testes de replay por canal.
- [x] Prisma validate, typechecks e builds.

Validacao local concluida em 20/07/2026: `1.221` testes, `pnpm typecheck`,
`prisma validate` e `pnpm build` aprovados.

## Deploy

1. Manter `INBOUND_WEBHOOK_REPLAY_ENABLED=false`.
2. Implantar migracao e API.
3. Implantar web.
4. Validar contagens por canal.
5. Ativar o gate e executar `canary_1` em um canal com rota pronta.
