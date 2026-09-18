# Follow-up: avulsos pagos com available=0 + UX cobranças

Status: aberto. Não autoriza deploy nem migration por si só.

## Problema

Cliente comprou números avulsos adicionais e a tela de assinatura permanece em
`occupied/capacity` cheia com `Disponíveis = 0`, impedindo nova conexão QR.

## Causa candidata

A liberação de conexão usa `WorkspaceSubscription.includedWhatsappNumbersSnapshot`.
Itens avulsos só elevam esse snapshot após confirmação Asaas **e**
`syncPaidItems()` bem-sucedido. Se o item ficar `pending_payment` com
`providerSyncStatus=failed|pending`, o cliente paga e não ganha vaga.

## Frontend

A UX de `/subscription` precisa ser redesenhada com **Claude Code**:
CTA de número avulso está no topo; pacote/instâncias/QR ficam depois dos dados
de cobrança. Mover capacidade + instâncias + CTA avulso para um fluxo contínuo
e mostrar estado real de ativação dos avulsos.

Plano canônico de orquestração:
`.hermes/plans/billing-additive-capacity-followup.md`
