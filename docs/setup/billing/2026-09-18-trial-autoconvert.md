# Trial de 30 dias com conversão automática

O trial é um `WorkspaceSubscription` `exempt` atual, com `trialEndsAt`. Ele
tem capacidade inicial de 1 ou 3 números e não cria cobrança nem plano pago.

`WPPTRACK_BILLING_TRIAL_AUTOCONVERT_ENABLED=false` é o padrão. Com a flag
ligada, o ciclo de lifecycle já existente executa a rotina:

- Até D-3, grava uma única auditoria `trial.autoconvert_d3` (gancho para
  notificação; não envia e-mail por conta própria).
- No fim, conta as linhas `WhatsappSeat` do workspace em `reserved`, `active`
  ou `suspended`. Instâncias UAZAPI são uma linha cada; canais externos de
  produção Umbler/Gupshup também são linhas. UAZAPI não recebe uma segunda
  linha de canal externo.
- Com `N >= 1`, cria uma única minuta privada `Pago N número(s)` por `N *
  R$30,00`, mantendo-a `draft` e `isCurrent=false`. O trial atual entra em
  `grace_period` até `trialEndsAt + 72h`; pagamento confirmado é o único evento
  que promove a minuta e substitui o contrato atual.
- Com `N = 0`, não há minuta paga. O registro isento fica histórico (`exempt`,
  `isCurrent=false`, `endedAt` preenchido), sem acesso e sem cobrança.

O opt-out é persistido no próprio contrato de trial (`trialAutoconvertDisabled`)
e pode ser aplicado por `POST
/backoffice/billing/package-contracts/:workspaceId/trial-autoconvert/disable`.
Trials são iniciados por `POST
/backoffice/billing/package-contracts/:workspaceId/start-trial`, com
`{ capacity: 1 | 3, reason }`.

Há uma migration aditiva para `trialEndsAt` e `trialAutoconvertDisabled`.
