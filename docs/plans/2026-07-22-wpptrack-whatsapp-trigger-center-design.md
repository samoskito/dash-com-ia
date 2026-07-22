# Central de gatilhos do WhatsApp

## Objetivo

Concentrar em `Configuracoes > Gatilhos do WhatsApp` todas as regras que
transformam mensagens e automacoes de provedores em eventos de conversao. A
tela de Integracoes permanece responsavel apenas por conexoes, webhooks,
canais, rotas Meta e saude tecnica.

## Responsabilidades

### Configuracoes

- criar, editar, testar, ativar e pausar regras;
- escolher a conexao de origem e os canais cobertos;
- configurar lead qualificado, compra por automacao, compra por mensagem e
  compra por catalogo;
- manter regras novas em observacao ate validacao;
- adaptar regras antigas para uma conexao Umbler sem duplicar a regra-base.

### Integracoes

- criar e administrar conexoes de provedores;
- exibir e rotacionar URLs privadas;
- descobrir canais e configurar rotas Meta;
- mostrar um resumo da quantidade de gatilhos e um atalho para Configuracoes.

### Backoffice

- auditar entregas e classificacoes;
- revisar compras ambiguas;
- executar replay e reprocessamento controlado.

## Adaptacao assistida

Uma regra antiga de compra por palavra-chave pode ser promovida para uma regra
Umbler por mensagem quando possuir produto e valor validos. O usuario precisa:

1. escolher uma conexao Umbler;
2. selecionar ao menos um canal daquela conexao;
3. revisar uma ou mais frases gatilho;
4. definir quem pode enviar a mensagem.

A operacao acontece em transacao e reutiliza o mesmo `ConversionRule`. Ela
troca o tipo antigo `keyword` por `message_phrase`, cria apenas a extensao
`ProviderConversionRuleConfig`, associa os canais e grava auditoria. A restricao
unica de `conversionRuleId` impede adaptar a mesma regra duas vezes. A regra
resultante sempre nasce em `observation`.

Na Umbler, as frases sao reconhecidas quando estiverem contidas na mensagem,
com normalizacao de caixa e acentos. A tela precisa deixar essa diferenca
explicita antes da adaptacao, principalmente para regras antigas configuradas
como correspondencia exata.

## Seguranca e compatibilidade

- somente usuarios com `canManageIntegrations` podem adaptar regras;
- conexao e canais sao validados pelo `workspaceId` e pelo vinculo entre eles;
- apenas regras antigas de `Purchase` por `keyword`, com valor positivo e
  moeda configurada, podem usar a primeira versao da adaptacao;
- regras diretas de outras fontes permanecem disponiveis em uma secao separada;
- nenhuma adaptacao ativa producao automaticamente;
- a URL principal da conexao continua restrita a Integracoes. A URL unica de
  automacao de uma regra aparece em Configuracoes somente no instante da
  criacao ou rotacao, porque faz parte do proprio gatilho e nao pode ser
  recuperada depois.

## Experiencia

`Gatilhos do WhatsApp` passa a ser organizado por origem. Cada conexao Umbler
exibe nome, canais e quantidade de regras, com o editor completo dentro da
propria origem. Regras anteriores ficam em uma area secundaria e recebem a
acao `Adaptar para Umbler` quando compativeis.

Em Integracoes, o editor de regras e removido. Em seu lugar aparece um resumo
compacto com o numero de gatilhos configurados e o comando `Gerenciar
gatilhos`, que leva diretamente para `Configuracoes#whatsapp-triggers`.

## Verificacao

- contratos compartilhados para a adaptacao;
- testes de autorizacao, isolamento de workspace e canais;
- teste de transacao e preservacao do ID da regra-base;
- teste de bloqueio de regras incompativeis ou ja adaptadas;
- testes da central em Configuracoes e do resumo em Integracoes;
- typecheck e build de API, web e shared.
