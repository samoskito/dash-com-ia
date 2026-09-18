# Rollback seguro: capacidade WhatsApp adicional F1

A migracao `20260828090000_additive_whatsapp_capacity_items` e aditiva. Este
documento descreve somente recuperacao operacional; ele nao autoriza nem
executa migracao.

## Rollback de aplicacao

O rollback e **forward-only**: desative a superficie F1 que cria ou concilia
itens adicionais, mantendo a migracao e todas as tabelas no banco. Nao execute
`prisma migrate reset`, nao reverta SQL e nao remova tabelas, indices ou
foreign keys como parte do rollback.

Em especial, retenha integralmente os registros de `WorkspaceSubscriptionItem`,
as `PaymentCharge` relacionadas e os eventos de `BillingContractAudit`. Eles
formam o historico de cobrancas, pagamentos e ativacoes necessario para
suporte, conciliacao e retomada segura.

Antes de reativar F1, reconcilie pagamentos Asaas ja confirmados e trate itens
com sincronizacao pendente ou falha. Uma correcao futura deve ser uma nova
migracao aditiva e revisada; nunca uma remocao retroativa dos dados F1.
