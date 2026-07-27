# Rollout de Pacotes WhatsApp, Asaas e Uazapi

Status: implementacao local concluida; ativacao externa pendente.

Este runbook separa schema, cadastro comercial, cobranca, fiscal, QR e
enforcement. Nenhuma etapa autoriza pular a anterior.

## Invariantes

- Um workspace possui uma assinatura mensal de pacote.
- Cada numero Uazapi conectado consome um assento.
- Cada canal externo Umbler/Gupshup em producao consome um assento.
- Observacao de canal externo nao consome assento.
- Checkout e redirect nunca ativam acesso; somente webhook Asaas autenticado.
- Falha fiscal nunca remove um acesso que ja foi pago.
- Cancelamento interrompe a renovacao e preserva o periodo ja pago.
- Backfill nao chama Asaas, Uazapi ou qualquer outro provedor.
- Conexoes atuais permanecem intocadas ate o backfill ser conferido e aplicado.

## Chaves De Ambiente

Todas as capacidades novas devem iniciar com `false`:

```dotenv
WPPTRACK_PACKAGE_BILLING_ENABLED=false
WPPTRACK_PACKAGE_BILLING_ENFORCEMENT_ENABLED=false
WPPTRACK_ASAAS_RECURRING_ENABLED=false
WPPTRACK_BILLING_LIFECYCLE_ENABLED=false
WPPTRACK_ASAAS_FISCAL_ENABLED=false
WPPTRACK_UAZAPI_PACKAGE_PROVISIONING_ENABLED=false
WPPTRACK_EXTERNAL_CHANNEL_BILLING_ENFORCEMENT_ENABLED=false
WPPTRACK_BILLING_LEGACY_BACKFILL_ENABLED=false
WPPTRACK_ASAAS_RECONCILIATION_ENABLED=false
```

Parametros operacionais:

```dotenv
WPPTRACK_BILLING_SEAT_RESERVATION_TTL_MINUTES=15
WPPTRACK_BILLING_GRACE_PERIOD_DAYS=3
WPPTRACK_BILLING_RECONCILIATION_INTERVAL_MS=300000
WPPTRACK_ASAAS_RECONCILIATION_INTERVAL_MS=21600000
WPPTRACK_ASAAS_RECONCILIATION_BATCH_SIZE=100
WPPTRACK_BILLING_CHECKOUT_SUCCESS_URL=https://SEU_APP/subscription
WPPTRACK_BILLING_CHECKOUT_CANCEL_URL=https://SEU_APP/subscription
```

Credenciais externas, sempre como secrets do ambiente:

```dotenv
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
UAZAPI_BASE_URL=
UAZAPI_ADMIN_TOKEN=
UAZAPI_WEBHOOK_AUTH_TOKEN=
```

Nao registrar valores dessas credenciais em logs, prints ou documentos.

## Fase 1 - Deploy Inerte

1. Publicar schema, API e web com todas as flags em `false`.
2. Confirmar `Database schema is up to date!`.
3. Confirmar `GET /health` com HTTP 200.
4. Abrir `/backoffice/billing`.
5. Confirmar que integracoes atuais continuam online.
6. Confirmar que nenhuma assinatura, assento ou instancia foi criada
   automaticamente.

Saida esperada: apenas novas tabelas e telas; comportamento atual inalterado.

## Fase 2 - Backfill Legado Protegido

1. Ligar somente:

```dotenv
WPPTRACK_PACKAGE_BILLING_ENABLED=true
WPPTRACK_BILLING_LEGACY_BACKFILL_ENABLED=true
```

2. Fazer redeploy da API.
3. Em `/backoffice/billing`, executar apenas a pre-visualizacao do backfill.
4. Comparar por workspace:
   - instancias Uazapi em producao;
   - canais externos em producao;
   - assentos que serao criados;
   - capacidade protegida;
   - duplicidades ou referencias conflitantes.
5. Nao aplicar enquanto existir divergencia.
6. Depois da conferencia humana, aplicar pelo backoffice.
7. Repetir a pre-visualizacao e confirmar resultado idempotente.

Saida esperada: um contrato `legacy_protected` por workspace atual e um assento
para cada recurso em producao, sem alterar status, rota, token ou webhook.

## Fase 3 - Catalogo Comercial

1. Cadastrar os planos padrao no backoffice.
2. Cadastrar planos personalizados como privados.
3. Cadastrar o plano isento.
4. Configurar o perfil fiscal da plataforma.
5. Atribuir planos somente aos workspaces escolhidos para o teste.
6. Confirmar que reduzir capacidade abaixo do uso atual e bloqueado.

Os exemplos aprovados podem coexistir:

- R$ 50,00 com tres numeros;
- R$ 100,00 com dez numeros;
- R$ 30,00 com cinco numeros;
- isento de mensalidade.

## Fase 4 - Sandbox Asaas

Manter enforcement, fiscal, Uazapi e canais externos desligados.

1. Configurar URL e chave do sandbox Asaas.
2. Configurar o token autenticador do webhook `POST /webhooks/asaas`.
3. Ligar:

```dotenv
WPPTRACK_ASAAS_RECURRING_ENABLED=true
WPPTRACK_BILLING_LIFECYCLE_ENABLED=true
```

4. No workspace canario, preencher o perfil de cobranca em `/subscription`.
5. Criar o checkout.
6. Confirmar no Asaas que existe:
   - um cliente reutilizavel;
   - um checkout;
   - uma assinatura recorrente;
   - `externalReference` do contrato.
7. Antes do pagamento, confirmar que contrato e acesso nao foram ativados.
8. Pagar no sandbox.
9. Confirmar que o webhook autenticado ativou exatamente um contrato.
10. Reenviar o mesmo webhook e confirmar que nao houve segunda transicao.

## Fase 5 - Fiscal

1. Conferir identificador municipal, codigo de servico, descricao, observacoes
   e impostos no backoffice.
2. Ligar:

```dotenv
WPPTRACK_ASAAS_FISCAL_ENABLED=true
```

3. Efetuar um novo pagamento sandbox.
4. Confirmar uma nota agendada para a cobranca atual.
5. Confirmar configuracao `ON_PAYMENT_CONFIRMATION` para as proximas cobrancas.
6. Simular uma rejeicao e confirmar:
   - acesso pago permanece ativo;
   - erro aparece no backoffice;
   - botao de nova tentativa fica disponivel;
   - nova tentativa nao cria nota duplicada.

## Fase 6 - Reconciliacao Asaas

Primeiro usar somente a acao manual `Conciliar` do backoffice.

1. Remover/atrasar um callback apenas no sandbox.
2. Conciliar o workspace.
3. Confirmar recuperacao deterministica da assinatura, pagamento e nota.
4. Repetir a conciliacao e confirmar ausencia de duplicidade.
5. Somente depois ligar a rotina:

```dotenv
WPPTRACK_ASAAS_RECONCILIATION_ENABLED=true
```

A rotina consulta em lote a cada seis horas e reutiliza a mesma deduplicacao
dos webhooks.

## Fase 7 - Uazapi

Manter enforcement global desligado.

1. Configurar credenciais Uazapi e o segredo de criptografia ja usado pelos
   conectores.
2. Ligar:

```dotenv
WPPTRACK_UAZAPI_PACKAGE_PROVISIONING_ENABLED=true
```

3. Usar um workspace sandbox com contrato ativo/isento e assento disponivel.
4. Criar a instancia pela tela de integracoes.
5. Confirmar que o assento fica `reserved`, nunca `active`, antes da conexao.
6. Escanear o QR exibido no produto.
7. Confirmar callback/status conectado e promocao para `active`.
8. Criar um segundo numero dentro do mesmo pacote.
9. Confirmar que nao foi criada uma segunda assinatura Asaas.
10. Tentar exceder a capacidade e confirmar bloqueio antes da chamada Uazapi.
11. Abandonar um QR e confirmar expiracao/liberacao da reserva.

## Fase 8 - Canais Externos

1. Confirmar que Umbler/Gupshup continuam recebendo em observacao sem assento.
2. Ligar:

```dotenv
WPPTRACK_EXTERNAL_CHANNEL_BILLING_ENFORCEMENT_ENABLED=true
```

3. Ativar somente um canal externo canario.
4. Confirmar consumo de um assento para esse canal.
5. Confirmar que outro canal da mesma conexao continua em observacao.
6. Confirmar que suspensao preserva payloads e bloqueia materializacao nova.
7. Confirmar que replay controlado continua uma acao separada.

## Fase 9 - Enforcement

Esta e a ultima flag:

```dotenv
WPPTRACK_PACKAGE_BILLING_ENFORCEMENT_ENABLED=true
```

Ativar apenas depois de:

- backfill legado conferido e aplicado;
- sandbox financeiro e fiscal aprovado;
- QR Uazapi aprovado;
- canal externo canario aprovado;
- cancelamento no fim do periodo aprovado;
- grace de tres dias e reativacao aprovados.

Aplicar primeiro a novos workspaces. Clientes legados continuam protegidos ate
receberem um plano definitivo por decisao comercial.

## Rollback

Em qualquer anomalia:

1. Voltar as flags da capacidade afetada para `false`.
2. Fazer redeploy da API.
3. Nao reverter migrations aditivas.
4. Nao apagar contratos, assentos, eventos ou auditorias.
5. Nao remover conexoes atuais.
6. Usar a conciliacao manual somente depois de identificar a causa.

Desligar uma flag impede novas mutacoes; nao desfaz pagamentos ou conexoes ja
confirmados.

## Evidencias Obrigatorias

- status das migrations;
- health da API;
- contagem do dry-run e do backfill aplicado;
- uma assinatura Asaas por workspace;
- webhook duplicado sem transicao duplicada;
- nota da primeira cobranca e configuracao das futuras;
- cancelamento preservando o periodo pago;
- grace e reativacao;
- QR conectado consumindo um assento;
- segundo numero sem nova assinatura;
- bloqueio no limite do pacote;
- canal externo em observacao sem assento e em producao com assento;
- ausencia de alteracao nas conexoes legadas.

## Checkpoints Que Exigem Intervencao Humana

- inserir credenciais Asaas e Uazapi;
- cadastrar/validar o webhook no painel Asaas;
- conferir e aplicar o backfill de producao;
- pagar o checkout sandbox;
- conferir a NFS-e no municipio/Asaas;
- escanear um QR real;
- confirmar contratos e precos comerciais;
- autorizar o primeiro canario de producao;
- observar uma renovacao completa ou simulacao oficial equivalente.
