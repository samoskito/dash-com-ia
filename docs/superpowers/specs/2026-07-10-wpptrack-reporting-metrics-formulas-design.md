# WppTrack Formulas e Metricas de Relatorios - Design Spec

Data: 2026-07-10

## 1. Objetivo

Definir as formulas finais e o contrato de metricas do WppTrack antes de implementar o motor backend centralizado de relatorios.

O foco e garantir que Visao Geral, Relatorios por campanha, Relatorios por conjunto e Relatorios por anuncio usem a mesma fonte de verdade, sem nomes tecnicos para o cliente, sem metricas duplicadas e sem misturar performance de midia paga com saude geral do negocio.

Esta spec consolida:

- analise do projeto de referencia `rastrack-dash`;
- documento de metricas `Rastracking WPP Direct - Dashboard FULL AI Version.md`;
- decisoes ja aprovadas nas specs Meta multi-conta e CAPI;
- decisoes de produto tomadas no brainstorming de 2026-07-10.

## 2. Principios

1. O dashboard deve falar a lingua do cliente final.
2. Nao mostrar evento tecnico duplicado se ele representa a mesma coisa para o negocio.
3. Nao inventar dado que a Meta nao retornou.
4. Separar performance de midia paga da saude geral do negocio.
5. Separar primeira compra de recompra para iniciar leitura de LTV.
6. Manter as tabelas analiticas por campanha/conjunto/anuncio consistentes com a Visao Geral.
7. Eventos reais do negocio contam no dashboard mesmo se o envio para Meta falhar; erro de envio entra em auditoria.

## 3. Identidade, periodo e atribuicao

### 3.1 Identidade principal do lead

O telefone normalizado do WhatsApp e a identidade principal do lead dentro do workspace.

Consequencias:

- Primeira compra e recompra sao calculadas por telefone normalizado.
- O mesmo telefone em um workspace representa o mesmo lead/cliente.
- Email, CPF ou outros identificadores poderao enriquecer a identidade no futuro, mas nao devem bloquear a primeira versao.

### 3.2 Data usada nos relatorios

Metricas de evento entram no periodo pela data real em que o evento aconteceu no WhatsApp/regra/conversao, nao pela data em que o evento foi enviado para a Meta.

Exemplos:

- Lead chegou hoje: entra hoje em Conversas reais iniciadas.
- Lead qualificado amanha: entra amanha em Lead qualificado.
- Compra no mes seguinte: entra no mes seguinte em Compras e Receita.

### 3.3 Atribuicao de campanha

Eventos pagos continuam atribuidos a campanha, conjunto e anuncio originais que trouxeram o lead quando houver origem rastreada.

Para recompra, a primeira versao atribui a recompra a campanha original de aquisicao do lead. Isso permite medir LTV por campanha de aquisicao.

Evolucao planejada: visao avancada por ultimo clique/interacao para comparar aquisicao original versus reengajamento.

## 4. Nomes de negocio

O backend pode manter nomes tecnicos de eventos, mas o frontend e exports devem usar nomes humanos.

| Evento tecnico | Nome para cliente | Regra |
| --- | --- | --- |
| `LeadSubmitted` | Conversas reais iniciadas | Nao aparece como KPI separado de LeadSubmitted |
| `QualifiedLead` | Lead qualificado | Aparece apenas se configurado/usado |
| `Purchase` | Compras | Aparece apenas se configurado/usado |

`LeadSubmitted` representa a conversa real iniciada. Exibir os dois ao mesmo tempo duplicaria a leitura do cliente.

## 5. Grupos de metricas

### 5.1 Trafego

Metricas ligadas ao Gerenciador de Anuncios/Meta Ads:

- Investimento.
- Conversas Meta.
- Custo por conversa Meta.

Conversas Meta so podem vir da API Meta. Se a Meta nao retornar a metrica, o valor fica indisponivel. O sistema nao deve usar Conversas reais iniciadas como fallback.

### 5.2 Conversas

Metricas ligadas ao que chegou no WhatsApp:

- Conversas reais iniciadas: conversas rastreadas e atribuidas a anuncio.
- Leads organicos: conversas sem origem rastreada de anuncio.
- Total recebido: Conversas reais iniciadas + Leads organicos.
- Taxa de rastreamento: Conversas reais iniciadas / Total recebido.

O termo para conversas sem rastreamento pago deve ser "organico", nao "nao rastreado", para evitar percepcao negativa.

### 5.3 Funil

O funil principal comeca em Conversas reais iniciadas.

Depois entram apenas eventos configurados ou usados pelo workspace:

- Lead qualificado.
- Compras.
- Eventos futuros configuraveis, como Initiate Checkout, AddToCart ou outros.

Se o evento foi configurado e esta zerado no periodo, ele aparece com `0`.
Se nunca foi configurado/usado no workspace, ele fica oculto.

### 5.4 Receita

Metricas de saude financeira:

- Faturamento de trafego.
- Faturamento organico.
- Faturamento total.
- Receita de primeira compra.
- Receita de recompra.
- Receita total.
- ROAS de aquisicao.
- ROAS com recompra.

## 6. Formulas

### 6.1 Custos por etapa

Para qualquer etapa de funil paga:

```text
custo_por_etapa = investimento_do_periodo_e_filtros / quantidade_da_etapa
```

Exemplos:

- Custo por conversa real = investimento / conversas reais iniciadas.
- Custo por lead qualificado = investimento / leads qualificados.
- Custo por compra = investimento / compras.

Se a quantidade for zero, o custo fica vazio/indisponivel, nao `R$ 0,00`.

### 6.2 Taxas do funil

Taxas sempre usam a etapa anterior visivel.

Exemplo com Lead qualificado configurado:

```text
taxa_lead_qualificado = leads_qualificados / conversas_reais
taxa_compra = compras / leads_qualificados
```

Exemplo sem Lead qualificado:

```text
taxa_compra = compras / conversas_reais
```

Se a etapa anterior for zero, a taxa fica vazia/indisponivel.

### 6.3 Receita

Compra com valor confiavel entra em receita.

Compra sem valor confiavel:

- conta em Compras;
- entra no Custo por compra;
- nao entra em Receita;
- nao entra no ROAS.

Formulas:

```text
faturamento_trafego = soma(valor_de_compras_atribuidas_a_midia_paga)
faturamento_organico = soma(valor_de_compras_de_leads_organicos)
faturamento_total = faturamento_trafego + faturamento_organico
```

### 6.4 Primeira compra e recompra

Por telefone normalizado no workspace:

```text
primeira_compra = primeira compra registrada para o telefone
recompra = toda compra posterior do mesmo telefone
```

Receitas:

```text
receita_primeira_compra = soma(valor_de_primeiras_compras)
receita_recompra = soma(valor_de_recompras)
receita_total = receita_primeira_compra + receita_recompra
```

### 6.5 ROAS

Existem dois ROAS:

```text
roas_aquisicao = receita_de_primeira_compra_atribuida_ao_trafego / investimento
roas_com_recompra = (receita_de_primeira_compra_atribuida_ao_trafego + receita_de_recompra_atribuida_ao_trafego) / investimento
```

ROAS nao usa faturamento organico.

Se nao houver investimento ou receita confiavel, ROAS fica vazio/indisponivel.

## 7. Organico e saude do negocio

Leads e compras organicas devem aparecer em leitura agregada de saude do negocio, mas nao podem contaminar performance de midia paga.

Regras:

- Organico aparece na Visao Geral.
- Organico pode aparecer em bloco separado no Relatorio agregado.
- Organico nao entra nas tabelas de campanha, conjunto e anuncio.
- Organico nao entra em ROAS.
- Organico nao tem CPL, custo por compra ou custo por etapa.

Quando houver filtro fino por BM, conta, campanha, conjunto ou anuncio:

- trafego respeita o filtro;
- organico so acompanha o filtro quando houver atribuicao possivel ao mesmo contexto;
- se nao houver como atribuir, organico fica apenas na visao geral/agregada sem filtro fino.

## 8. Tabelas e escopos

### 8.1 Padrao de escopo

Relatorios devem considerar, por padrao:

- contas Meta ativas configuradas em Integracoes;
- campanhas/conjuntos/anuncios classificados como WhatsApp;
- periodo selecionado;
- filtros de BM, conta, campanha, conjunto, anuncio, nome e status.

O modo "todas as campanhas" existe para auditoria, mas nao e o padrao executivo.

### 8.2 Linhas de campanha, conjunto e anuncio

Cada linha deve usar o mesmo motor de metricas.

Campos principais esperados:

- Nome e status.
- Investimento.
- Conversas Meta, quando Meta retornar.
- Conversas reais iniciadas.
- Custo por conversa real.
- Lead qualificado, se configurado/usado.
- Custo por lead qualificado, se aplicavel.
- Compras, se configurado/usado.
- Custo por compra, se aplicavel.
- Receita de primeira compra.
- Receita de recompra.
- Faturamento de trafego.
- ROAS de aquisicao.
- ROAS com recompra.

### 8.3 Linhas de resumo

Cada tabela deve ter resumo fixo no rodape:

- contagem de linhas visiveis por status;
- soma de investimento;
- soma de conversas;
- soma de eventos;
- soma de receitas;
- ROAS calculado a partir do total, nao media simples das linhas.

## 9. Visao Geral

A Visao Geral deve ser executiva, com KPIs por categoria:

### Trafego

- Investimento.
- Conversas Meta.
- Custo por conversa Meta.

### Conversas

- Conversas reais iniciadas.
- Custo por conversa real.
- Leads organicos.
- Total recebido.
- Taxa de rastreamento.

### Funil

- Conversas reais iniciadas.
- Lead qualificado, se configurado/usado.
- Compras, se configurado/usado.
- Taxas entre etapas.

### Receita

- Faturamento de trafego.
- Faturamento organico.
- Faturamento total.
- Receita de primeira compra.
- Receita de recompra.
- ROAS de aquisicao.
- ROAS com recompra.

Comparacao com periodo anterior fica prevista, mas a primeira implementacao deve priorizar a metrica atual correta.

## 10. Auditoria de eventos Meta

Evento real do negocio conta no dashboard mesmo quando o envio para a Meta falha.

A auditoria deve mostrar o ciclo de envio para Meta:

- enviado com sucesso;
- pendente;
- em retry;
- bloqueado;
- falhou.

Cada item auditado deve mostrar:

- evento;
- nome humano do evento;
- lead/conversa;
- telefone mascarado ou hash;
- campanha/conjunto/anuncio quando houver;
- pixel/pagina;
- data do evento real;
- data de tentativa/envio;
- status de envio;
- resposta resumida da Meta;
- codigo e mensagem de erro.

Essa area deve ficar como Auditoria de eventos Meta ou Diagnostico de conversoes, sem poluir os KPIs principais.

## 11. Exportacao

### 11.1 CSV

CSV deve exportar as tabelas com os filtros aplicados.

Os nomes das colunas devem ser humanos:

- Conversas reais iniciadas.
- Lead qualificado.
- Compras.
- Receita de primeira compra.
- Receita de recompra.
- ROAS de aquisicao.
- ROAS com recompra.

### 11.2 PDF

PDF deve ficar previsto na arquitetura.

Ele deve ser executivo, nao apenas uma tabela impressa:

- logo/nome da empresa;
- periodo;
- filtros;
- KPIs principais;
- funil;
- receitas;
- principais campanhas/conjuntos/anuncios;
- resumo claro para cliente final.

Implementacao do PDF pode vir depois do motor de metricas e do CSV.

## 12. Motor backend centralizado

A implementacao deve criar um motor unico para calcular metricas.

Responsabilidades:

- receber periodo, workspace e filtros;
- carregar investimento/insights Meta;
- carregar leads e eventos;
- classificar eventos pagos, organicos, primeira compra e recompra;
- aplicar visibilidade dinamica de eventos configurados/usados;
- calcular custos, taxas, receitas e ROAS;
- devolver DTOs reutilizaveis por Visao Geral, campanhas, conjuntos, anuncios e exportacao.

Motivo:

Hoje a logica esta espalhada em relatorios e UI. Um motor central reduz divergencia entre Visao Geral, Relatorios e exports.

## 13. Dados e migracoes conceituais

Possiveis ajustes de dados:

- Guardar valor confiavel de Purchase em centavos.
- Guardar moeda do evento.
- Guardar `eventOccurredAt` separado de `sentAt`/`createdAt`.
- Guardar classificacao de compra: `first_purchase` ou `repurchase`.
- Guardar `customerIdentityKey` baseado no telefone normalizado.
- Guardar ou derivar se o evento e pago ou organico.
- Guardar status de envio Meta separado do fato de negocio.

A implementacao deve avaliar o que ja existe em `Lead`, `ConversionEventLog` e snapshots Meta antes de criar novas colunas.

## 14. Testes

Testes esperados:

- `LeadSubmitted` aparece como Conversas reais iniciadas, sem duplicar KPI.
- `QualifiedLead` aparece como Lead qualificado.
- `Purchase` aparece como Compras.
- Evento configurado e zerado aparece com `0`.
- Evento nunca configurado/usado fica oculto.
- Custo por etapa retorna null quando a quantidade e zero.
- Taxa usa a etapa anterior visivel.
- Compra sem valor conta em Compras e nao entra em Receita/ROAS.
- Compra com valor entra em receita correta.
- Primeira compra e recompra sao separadas por telefone normalizado.
- ROAS de aquisicao usa apenas primeira compra paga.
- ROAS com recompra usa primeira compra + recompra pagas.
- Faturamento organico aparece em agregados, mas nao em tabelas de campanha/conjunto/anuncio.
- Evento com envio Meta falho continua contando no dashboard e aparece na auditoria.
- Resumo de tabela soma totais e calcula ROAS sobre totais, nao media das linhas.

## 15. Fora do escopo desta spec

- Implementar IA de analise de conversa.
- Criar chat/CRM/Kanban.
- Editar campanhas, orcamentos ou status no Meta.
- Criar PDF agora.
- Definir atribuicao por ultimo clique/interacao.
- Migrar para WhatsApp Cloud API oficial.
- Recriar o layout final completo do dashboard.

## 16. Proximo passo

Depois da aprovacao desta spec, criar o plano de implementacao com foco em:

1. Contratos compartilhados das novas metricas.
2. Ajustes Prisma necessarios para data do evento, valor, receita e recompra.
3. Motor backend centralizado de metricas.
4. Aplicacao do motor em Visao Geral.
5. Aplicacao do motor em Relatorios por campanha, conjunto e anuncio.
6. Export CSV com nomes humanos.
7. Auditoria de eventos Meta em endpoint/tela de diagnostico.
8. Testes automatizados.

