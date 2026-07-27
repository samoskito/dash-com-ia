import type {
  BillingInvoiceStatus,
  WorkspaceBillingProfileStatus,
  WorkspacePackageBillingStateDto,
  WorkspaceSubscriptionContractStatus,
} from "@wpptrack/shared";
import {
  Ban,
  CalendarClock,
  CreditCard,
  FileCheck2,
  QrCode,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SubmitButton } from "../../../components/submit-button";
import { getCurrentWorkspace } from "../../../lib/current-workspace";
import { serverApiFetch } from "../../../lib/server-api";
import {
  cancelPackageSubscriptionAction,
  provisionPackageUazapiAction,
  saveBillingProfileAction,
  startPackageCheckoutAction,
} from "./actions";
import { PackageBillingActionForm } from "./package-billing-action-form";

type BillingResource = {
  data: WorkspacePackageBillingStateDto | null;
  state: "real" | "error";
};

async function getPackageBillingState(): Promise<BillingResource> {
  try {
    return {
      data: await serverApiFetch<WorkspacePackageBillingStateDto>(
        "/billing/package/state",
      ),
      state: "real",
    };
  } catch {
    return { data: null, state: "error" };
  }
}

export default async function SubscriptionPage() {
  const [billingResult, workspace] = await Promise.all([
    getPackageBillingState(),
    getCurrentWorkspace(),
  ]);
  const billing = billingResult.data;

  if (!billing || !workspace) {
    return (
      <section className="page-stack page-standard package-billing-page">
        <header className="page-header">
          <div>
            <span className="eyebrow">Conta e cobranca</span>
            <h1>Assinatura</h1>
            <p>O estado financeiro deste workspace esta indisponivel.</p>
          </div>
        </header>
        <div className="feedback-banner warn" role="alert">
          <strong>Nao foi possivel carregar a assinatura</strong>
          <span>Atualize a pagina ou tente novamente em alguns minutos.</span>
        </div>
      </section>
    );
  }

  const canManageBilling = workspace.permissions.canManageBilling;
  const canManageIntegrations = workspace.permissions.canManageIntegrations;
  const contract = billing.contract;
  const planIsManagedByPlatform =
    contract?.status === "exempt" || contract?.status === "legacy_protected";
  const canCancel =
    canManageBilling &&
    billing.capabilities.lifecycle &&
    Boolean(contract) &&
    !planIsManagedByPlatform &&
    contract?.status !== "cancel_at_period_end" &&
    contract?.status !== "canceled";
  const canProvision =
    canManageIntegrations &&
    billing.capabilities.packageBilling &&
    billing.capabilities.uazapiProvisioning &&
    billing.seats.available > 0 &&
    Boolean(contract && contractAllowsProvisioning(contract.status));

  return (
    <section className="page-stack page-standard package-billing-page">
      <header className="page-header package-billing-header">
        <div>
          <span className="eyebrow">Conta e cobranca</span>
          <h1>Assinatura WhatsApp</h1>
          <p>
            Pacote mensal, numeros conectados, pagamentos e notas fiscais deste
            workspace.
          </p>
        </div>
        <div className="header-actions">
          <span
            className={`status-chip${contractStatusTone(contract?.status)}`}
          >
            {contractStatusLabel(contract?.status)}
          </span>
        </div>
      </header>

      {!billing.capabilities.packageBilling ? (
        <div className="feedback-banner warn" role="status">
          <strong>Nova cobranca ainda em rollout protegido</strong>
          <span>
            Nenhuma conexao atual foi alterada. A ativacao comercial depende da
            liberacao das flags no backend.
          </span>
        </div>
      ) : null}

      <section
        className="package-contract-band"
        aria-labelledby="package-contract-title"
      >
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Contrato atual</span>
            <h2 id="package-contract-title">
              {contract?.planName ?? "Pacote ainda nao definido"}
            </h2>
          </div>
          <strong className="package-price">
            {contract
              ? money(contract.monthlyPriceCents)
              : "Aguardando escolha"}
            {contract ? <small>/mes</small> : null}
          </strong>
        </div>
        <div className="package-contract-facts">
          <Fact
            icon={CreditCard}
            label="Pagamento"
            value={contractStatusLabel(contract?.status)}
          />
          <Fact
            icon={Smartphone}
            label="Numeros incluidos"
            value={String(contract?.includedWhatsappNumbers ?? 0)}
          />
          <Fact
            icon={CalendarClock}
            label="Periodo atual"
            value={periodLabel(
              contract?.currentPeriodStart,
              contract?.currentPeriodEnd,
            )}
          />
          <Fact
            icon={FileCheck2}
            label="Nota fiscal"
            value={invoiceStatusLabel(contract?.fiscalStatus)}
          />
        </div>
        {contract?.status === "grace_period" ? (
          <div className="package-alert">
            <strong>Pagamento em atraso</strong>
            <span>
              Regularize ate {dateLabel(contract.graceEndsAt)} para evitar a
              suspensao das conexoes.
            </span>
          </div>
        ) : null}
        {contract?.status === "cancel_at_period_end" ? (
          <div className="package-alert">
            <strong>Renovacao cancelada</strong>
            <span>O acesso permanece ativo ate {dateLabel(contract.accessEndsAt)}.</span>
          </div>
        ) : null}
      </section>

      <section
        className="surface-panel package-seat-panel"
        aria-labelledby="package-seat-title"
      >
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Capacidade WhatsApp</span>
            <h2 id="package-seat-title">Numeros do pacote</h2>
          </div>
          <span className="status-chip">
            {billing.seats.occupied}/{billing.seats.capacity} ocupados
          </span>
        </div>
        <div
          className="package-seat-progress"
          role="progressbar"
          aria-label="Ocupacao do pacote"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, billing.seats.capacity)}
          aria-valuenow={billing.seats.occupied}
        >
          <span
            style={{
              width: `${
                billing.seats.capacity
                  ? Math.min(
                      100,
                      Math.round(
                        (billing.seats.occupied / billing.seats.capacity) * 100,
                      ),
                    )
                  : 0
              }%`,
            }}
          />
        </div>
        <div className="package-seat-stats">
          <strong>
            <span>Ativos</span>
            {billing.seats.active}
          </strong>
          <strong>
            <span>Reservados</span>
            {billing.seats.reserved}
          </strong>
          <strong>
            <span>Disponiveis</span>
            {billing.seats.available}
          </strong>
          <strong>
            <span>Suspensos</span>
            {billing.seats.suspended}
          </strong>
        </div>
        <div className="package-seat-actions">
          <Link className="button ghost" href="/integrations">
            Gerenciar fontes externas
          </Link>
          <Link className="button ghost" href="/subscription#uazapi">
            Conectar por QR
          </Link>
        </div>
      </section>

      <section className="surface-panel" aria-labelledby="package-profile-title">
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Responsavel financeiro</span>
            <h2 id="package-profile-title">Dados de cobranca</h2>
          </div>
          <span
            className={`status-chip${
              billing.profile?.status === "valid" ? "" : " warn"
            }`}
          >
            {profileStatusLabel(billing.profile?.status)}
          </span>
        </div>
        <PackageBillingActionForm
          action={saveBillingProfileAction}
          className="package-profile-form"
        >
          <fieldset disabled={!canManageBilling}>
            <label>
              <span>Tipo</span>
              <select
                name="payerType"
                defaultValue={billing.profile?.payerType ?? "company"}
              >
                <option value="company">Pessoa juridica</option>
                <option value="individual">Pessoa fisica</option>
              </select>
            </label>
            <label className="package-field-wide">
              <span>Nome ou razao social</span>
              <input
                name="payerName"
                defaultValue={billing.profile?.payerName ?? ""}
                required
              />
            </label>
            <label>
              <span>CPF ou CNPJ</span>
              <input
                name="taxId"
                defaultValue={billing.profile?.taxId ?? ""}
                required
              />
            </label>
            <label>
              <span>Email financeiro</span>
              <input
                name="billingEmail"
                type="email"
                defaultValue={billing.profile?.billingEmail ?? ""}
                required
              />
            </label>
            <label>
              <span>Telefone</span>
              <input
                name="phone"
                defaultValue={billing.profile?.phone ?? ""}
                required
              />
            </label>
            <label>
              <span>CEP</span>
              <input
                name="postalCode"
                defaultValue={billing.profile?.postalCode ?? ""}
                required
              />
            </label>
            <label className="package-field-wide">
              <span>Endereco</span>
              <input
                name="addressLine"
                defaultValue={billing.profile?.addressLine ?? ""}
                required
              />
            </label>
            <label>
              <span>Numero</span>
              <input
                name="addressNumber"
                defaultValue={billing.profile?.addressNumber ?? ""}
                required
              />
            </label>
            <label>
              <span>Complemento</span>
              <input
                name="addressComplement"
                defaultValue={billing.profile?.addressComplement ?? ""}
              />
            </label>
            <label>
              <span>Bairro</span>
              <input
                name="district"
                defaultValue={billing.profile?.district ?? ""}
                required
              />
            </label>
            <label>
              <span>Cidade</span>
              <input
                name="city"
                defaultValue={billing.profile?.city ?? ""}
                required
              />
            </label>
            <label>
              <span>UF</span>
              <input
                name="state"
                maxLength={2}
                defaultValue={billing.profile?.state ?? ""}
                required
              />
            </label>
          </fieldset>
          {canManageBilling ? (
            <SubmitButton
              className="button primary"
              pendingLabel="Salvando..."
              statusText="Validando dados financeiros."
            >
              Salvar dados
            </SubmitButton>
          ) : (
            <p className="muted">Somente o responsavel da conta pode alterar.</p>
          )}
        </PackageBillingActionForm>
      </section>

      <section className="package-plan-section" aria-labelledby="plans-title">
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Pacotes disponiveis</span>
            <h2 id="plans-title">Escolha pela quantidade de numeros</h2>
          </div>
        </div>
        <div className="package-plan-grid">
          {billing.availablePlans.map((plan) => {
            const selected = contract?.planId === plan.id;
            const checkoutPending =
              selected &&
              (contract?.status === "draft" ||
                contract?.status === "awaiting_payment");
            const checkoutEnabled =
              canManageBilling &&
              billing.capabilities.packageBilling &&
              billing.capabilities.recurringCheckout &&
              Boolean(billing.profile);

            return (
              <article
                className={`package-plan-card${selected ? " selected" : ""}`}
                key={plan.id}
              >
                <div>
                  <span className="eyebrow">
                    {plan.includedWhatsappNumbers} numero(s)
                  </span>
                  <h3>{plan.name}</h3>
                </div>
                <strong>
                  {money(plan.monthlyPriceCents)}
                  <small>/mes</small>
                </strong>
                <span className={`status-chip${selected ? "" : " neutral"}`}>
                  {checkoutPending
                    ? contract?.status === "draft"
                      ? "Checkout pendente"
                      : "Aguardando pagamento"
                    : selected
                      ? "Pacote atual"
                      : "Disponivel"}
                </span>
                {!selected || checkoutPending ? (
                  <PackageBillingActionForm
                    action={startPackageCheckoutAction}
                  >
                    <input type="hidden" name="planId" value={plan.id} />
                    <SubmitButton
                      className="button primary"
                      disabled={!checkoutEnabled}
                      pendingLabel="Abrindo..."
                      statusText="Preparando checkout recorrente."
                    >
                      {checkoutPending
                        ? "Continuar pagamento"
                        : "Contratar pacote"}
                    </SubmitButton>
                  </PackageBillingActionForm>
                ) : null}
              </article>
            );
          })}
          {billing.availablePlans.length === 0 ? (
            <div className="feedback-banner warn">
              <strong>Nenhum pacote publico disponivel</strong>
              <span>O backoffice precisa publicar um pacote comercial.</span>
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="surface-panel package-uazapi-panel"
        id="uazapi"
        aria-labelledby="uazapi-title"
      >
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">WhatsApp por QR code</span>
            <h2 id="uazapi-title">Nova conexao Uazapi</h2>
          </div>
          <QrCode aria-hidden="true" size={28} />
        </div>
        <PackageBillingActionForm
          action={provisionPackageUazapiAction}
          className="inline-form package-uazapi-form"
          showProvisionResult
        >
          <input
            minLength={2}
            name="instanceName"
            placeholder="Nome do numero ou setor"
            required
            aria-label="Nome da conexao WhatsApp"
          />
          <SubmitButton
            className="button primary"
            disabled={!canProvision}
            pendingLabel="Preparando QR..."
            statusText="Criando a instancia e reservando uma vaga."
          >
            Gerar QR code
          </SubmitButton>
        </PackageBillingActionForm>
        {!canProvision ? (
          <p className="muted">
            {billing.seats.available <= 0
              ? "O pacote esta sem vagas disponiveis."
              : "O provisionamento por QR ainda nao esta liberado para este contrato."}
          </p>
        ) : null}
      </section>

      <section
        className="surface-panel package-invoice-panel"
        aria-labelledby="invoice-title"
      >
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Historico fiscal</span>
            <h2 id="invoice-title">Pagamentos e notas fiscais</h2>
          </div>
          <span className="status-chip">
            {billing.invoices.length} registro(s)
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor</th>
                <th>Pagamento</th>
                <th>Nota fiscal</th>
              </tr>
            </thead>
            <tbody>
              {billing.invoices.length ? (
                billing.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{dateLabel(invoice.createdAt)}</td>
                    <td>{money(invoice.amountCents)}</td>
                    <td>
                      {invoice.providerPaymentId
                        ? "Pagamento confirmado"
                        : "Aguardando referencia"}
                    </td>
                    <td>
                      <span
                        className={`status-chip${invoiceStatusTone(
                          invoice.status,
                        )}`}
                      >
                        {invoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <strong>Nenhum pagamento registrado</strong>
                    <span>O historico aparecera apos a primeira cobranca.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="surface-panel package-cancel-panel"
        aria-labelledby="cancel-title"
      >
        <div className="package-section-heading">
          <div>
            <span className="eyebrow">Renovacao</span>
            <h2 id="cancel-title">Cancelar assinatura</h2>
          </div>
          <Ban aria-hidden="true" size={24} />
        </div>
        {planIsManagedByPlatform ? (
          <p className="muted">
            Este contrato especial e administrado pelo suporte da plataforma.
          </p>
        ) : (
          <PackageBillingActionForm
            action={cancelPackageSubscriptionAction}
            className="package-cancel-form"
          >
            <label>
              <span>Motivo opcional</span>
              <input name="reason" placeholder="Motivo do cancelamento" />
            </label>
            <label className="package-confirmation">
              <input name="confirmation" type="checkbox" value="true" />
              <span>
                Confirmo o cancelamento da renovacao ao fim do periodo atual.
              </span>
            </label>
            <SubmitButton
              className="button danger"
              disabled={!canCancel}
              pendingLabel="Cancelando..."
              statusText="Encerrando a renovacao no Asaas."
            >
              Cancelar renovacao
            </SubmitButton>
          </PackageBillingActionForm>
        )}
      </section>
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon aria-hidden="true" size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function dateLabel(value: string | null | undefined): string {
  return value
    ? new Date(value).toLocaleDateString("pt-BR")
    : "Nao definido";
}

function periodLabel(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) {
    return "Ainda nao iniciado";
  }

  return `${dateLabel(start)} a ${dateLabel(end)}`;
}

function contractAllowsProvisioning(
  status: WorkspaceSubscriptionContractStatus,
): boolean {
  return [
    "active",
    "grace_period",
    "exempt",
    "legacy_protected",
  ].includes(status);
}

function contractStatusLabel(
  status: WorkspaceSubscriptionContractStatus | undefined,
): string {
  if (!status) {
    return "Sem pacote";
  }

  const labels: Record<WorkspaceSubscriptionContractStatus, string> = {
    draft: "Configuracao pendente",
    awaiting_payment: "Aguardando pagamento",
    active: "Assinatura ativa",
    past_due: "Pagamento vencido",
    grace_period: "Periodo de tolerancia",
    cancel_at_period_end: "Cancelada ao fim do periodo",
    suspended: "Acesso suspenso",
    canceled: "Assinatura encerrada",
    exempt: "Isento",
    legacy_protected: "Contrato legado protegido",
  };

  return labels[status];
}

function contractStatusTone(
  status: WorkspaceSubscriptionContractStatus | undefined,
): string {
  if (!status) {
    return " neutral";
  }

  if (
    ["awaiting_payment", "past_due", "grace_period", "suspended"].includes(
      status,
    )
  ) {
    return " warn";
  }

  if (status === "canceled") {
    return " bad";
  }

  return "";
}

function invoiceStatusLabel(
  status: BillingInvoiceStatus | null | undefined,
): string {
  if (!status) {
    return "Nao configurada";
  }

  const labels: Record<BillingInvoiceStatus, string> = {
    not_configured: "Nao configurada",
    pending_configuration: "Configuracao pendente",
    scheduled: "Emissao agendada",
    issued: "Emitida",
    authorized: "Autorizada",
    canceled: "Cancelada",
    failed: "Falha na emissao",
    rejected: "Rejeitada",
  };

  return labels[status];
}

function invoiceStatusTone(status: BillingInvoiceStatus): string {
  return ["failed", "rejected", "pending_configuration"].includes(status)
    ? " warn"
    : status === "canceled"
      ? " neutral"
      : "";
}

function profileStatusLabel(
  status: WorkspaceBillingProfileStatus | undefined,
): string {
  if (status === "valid") {
    return "Dados validados";
  }

  return status === "invalid" ? "Dados invalidos" : "Cadastro pendente";
}
