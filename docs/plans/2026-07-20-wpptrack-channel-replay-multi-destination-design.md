# Replay por canal e multiplos destinos Meta

## Objetivo

Permitir que o Platform Owner execute um replay canario de uma conexao Umbler
limitado a um canal escolhido e permitir que uma mesma conta de anuncios use
mais de uma combinacao Pixel/Dataset + Pagina sem enviar uma conversao para o
destino errado.

## Decisoes

- O replay continua exclusivo do Platform Owner e protegido por
  `INBOUND_WEBHOOK_REPLAY_ENABLED`.
- O escopo de canal e opcional. Lotes antigos e o comportamento por conexao
  continuam validos.
- A tela de replay mostra os canais da conexao e a quantidade elegivel de cada
  um. O canario usa apenas o canal selecionado.
- Uma conta de anuncios mantem seu destino atual como fallback e pode ter
  destinos adicionais autorizados.
- Cada anuncio pode resolver para no maximo um destino. A atribuicao manual tem
  precedencia sobre a deteccao automatica.
- A deteccao automatica usa os identificadores de Dataset/Pixel e Pagina
  retornados pelos metadados do anuncio durante a sincronizacao.
- Zero correspondencias ou mais de uma correspondencia mantem o CTWA pendente.
  O sistema nunca escolhe o primeiro destino silenciosamente.
- As rotas e destinos atuais permanecem validos. A migracao apenas cria novas
  tabelas e campos opcionais.

## Modelo

`MetaReportingAccountDestination` representa a relacao muitos-para-muitos entre
contas e destinos autorizados. O campo legado
`MetaReportingAccount.conversionDestinationId` continua sendo o destino padrao.

`MetaAdDestinationAssignment` representa a decisao final de destino de um
anuncio. Ela registra origem `automatic` ou `manual`, o destino escolhido e os
identificadores detectados. A chave unica por workspace e anuncio impede duas
decisoes simultaneas.

`InboundWebhookReplayBatch.channelId` registra o canal escolhido. `null`
preserva lotes antigos por conexao.

## Fluxo de resolucao

1. A sincronizacao Meta salva anuncios e coleta, em modo de melhor esforco, os
   identificadores de Dataset/Pixel e Pagina.
2. O reconciliador compara esses identificadores com os destinos autorizados da
   conta.
3. Uma correspondencia unica cria ou atualiza a atribuicao automatica.
4. Uma atribuicao manual existente nunca e substituida pela sincronizacao.
5. O roteador Umbler resolve o `ad_id`, a conta e a atribuicao do anuncio.
6. Sem atribuicao, usa o destino legado apenas quando a conta tem no maximo um
   destino efetivo. Com varios destinos, o evento permanece pendente.

## Seguranca e rollout

- Todas as consultas incluem `workspaceId`.
- IDs de canal, conta, anuncio e destino sao revalidados no backend.
- Auditoria registra alteracoes de destinos, atribuicoes e escopo do replay.
- O gate de replay permanece desligado durante migracao e deploy.
- Primeiro teste: selecionar um canal com `Rota pronta`, executar `canary_1` e
  conferir materializacao e Eventos Meta antes de ampliar o lote.
