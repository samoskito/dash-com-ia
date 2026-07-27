import type {
  BackofficeClientWorkspaceDto,
  LegacyBillingBackfillReportDto,
  PlatformFiscalSettingsDto,
  WhatsappPackagePlanDto,
  WorkspacePackageSubscriptionDto,
  WorkspaceSubscriptionContractStatus,
} from "@wpptrack/shared";
import {
  BadgeDollarSign,
  FileCheck2,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../components/backoffice-navigation";
import { PendingSubmitButton } from "../../../../components/pending-submit-button";
import { serverApiFetch } from "../../../../lib/server-api";
import {
  applyLegacyBillingBackfillAction,
  assignPackagePlanAction,
  createPackagePlanAction,
  reconcileWorkspaceBillingAction,
  retryFiscalInvoiceAction,
  saveFiscalSettingsAction,
  updatePackagePlanAction,
} from "./actions";

type ResourceResult<T> = {
  data: T;
  state: "real" | "empty" | "error";
};

type PlatformSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    platformRole?: "platform_owner" | "platform_operator" | null;
  };
};

type BackofficePackageContract = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  contract: WorkspacePackageSubscriptionDto;
};

type ActionableBillingInvoice = {
  id: string;
  status: "pending_configuration" | "failed" | "rejected";
  amountCents: number | null;
  providerPaymentId: string | null;
  lastErrorCode: string | null;
  retryCount: number;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  subscription: {
    id: string;
    planNameSnapshot: string | null;
    fiscalLastErrorCode: string | null;
  };
};

async function resource<T>(path: string, empty: T): Promise<ResourceResult<T>> {
  try {
    const data = await serverApiFetch<T>(path);
    const isEmpty = Array.isArray(data) && data.length === 0;
    return { data, state: isEmpty ? "empty" : "real" };
  } catch {
    return { data: empty, state: "error" };
  }
}

async function getPlatformSession(): Promise<PlatformSession | null> {
  try {
    return await serverApiFetch<PlatformSession>("/auth/me");
  } catch {
    return null;
  }
}

export default async function BackofficeBillingPage() {
  const session = await getPlatformSession();
  const isPlatformOwner = session?.user.platformRole === "platform_owner";
  const [
    plansResult,
    contractsResult,
    workspacesResult,
    fiscalResult,
    legacyBackfillResult,
    actionableInvoicesResult,
  ] = await Promise.all([
    resource<WhatsappPackagePlanDto[]>("/backoffice/billing/package-plans", []),
    resource<BackofficePackageContract[]>(
      "/backoffice/billing/package-contracts",
      [],
    ),
    resource<BackofficeClientWorkspaceDto[]>("/backoffice/workspaces", []),
    isPlatformOwner
      ? resource<PlatformFiscalSettingsDto | null>(
          "/backoffice/billing/fiscal-settings",
          null,
        )
      : Promise.resolve({
          data: null,
          state: "empty" as const,
        }),
    resource<LegacyBillingBackfillReportDto>(
      "/backoffice/billing/legacy-backfill",
      emptyLegacyBackfillReport(),
    ),
    resource<ActionableBillingInvoice[]>(
      "/backoffice/billing/invoices/actionable",
      [],
    ),
  ]);

  const plans = plansResult.data;
  const contracts = contractsResult.data;
  const workspaces = workspacesResult.data;
  const fiscal = fiscalResult.data;
  const legacyBackfill = legacyBackfillResult.data;
  const actionableInvoices = actionableInvoicesResult.data;
  const occupiedSeats = contracts.reduce(
    (total, entry) => total + entry.contract.occupiedWhatsappNumbers,
    0,
  );
  const contractedCapacity = contracts
    .filter((entry) => contractConsumesCapacity(entry.contract.status))
    .reduce(
      (total, entry) => total + entry.contract.includedWhatsappNumbers,
      0,
    );
  const specialPlans = plans.filter((plan) => plan.kind !== "standard").length;

  return (
    <section className="page-stack standalone-page billing-admin-page">
      <BackofficeNavigation active="billing" />

      <header className="page-header">
        <div>
          <span className="eyebrow">Receita e capacidade</span>
          <h1>Assinaturas WhatsApp</h1>
          <p>
            Pacotes por workspace, vagas de numeros e emissao fiscal a cada
            pagamento.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-chip">
            {isPlatformOwner ? "Platform Owner" : "Somente leitura"}
          </span>
        </div>
      </header>

      {[
        plansResult,
        contractsResult,
        workspacesResult,
        legacyBackfillResult,
        actionableInvoicesResult,
      ].some((entry) => entry.state === "error") ? (
        <div className="feedback-banner warn" role="alert">
          <strong>Parte dos dados financeiros esta indisponivel</strong>
          <span>
            Nenhuma acao foi executada. Atualize a pagina antes de operar.
          </span>
        </div>
      ) : null}

      <div className="billing-admin-summary" aria-label="Resumo de assinaturas">
        <SummaryFact
          icon={PackageCheck}
          label="Pacotes"
          value={String(plans.length)}
        />
        <SummaryFact
          icon={BadgeDollarSign}
          label="Contratos"
          value={String(contracts.length)}
        />
        <SummaryFact
          icon={Smartphone}
          label="Vagas ocupadas"
          value={`${occupiedSeats}/${contractedCapacity}`}
        />
        <SummaryFact
          icon={ShieldCheck}
          label="Planos especiais"
          value={String(specialPlans)}
        />
      </div>

      <section className="surface-panel billing-admin-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Protecao da base atual</span>
            <h2>Legado protegido</h2>
            <p className="muted">
              A previa inventaria numeros em producao sem alterar conexoes,
              chamar provedores ou iniciar cobranca.
            </p>
          </div>
          <span
            className={`status-chip${
              legacyBackfill.applyEnabled ? "" : " neutral"
            }`}
          >
            {legacyBackfill.applyEnabled
              ? "Aplicacao liberada"
              : "Somente simulacao"}
          </span>
        </div>

        <div
          className="billing-backfill-summary"
          aria-label="Resumo do legado protegido"
        >
          <SummaryFact
            icon={ShieldCheck}
            label="Elegiveis"
            value={String(legacyBackfill.summary.eligibleWorkspaces)}
          />
          <SummaryFact
            icon={PackageCheck}
            label="Ja protegidos"
            value={String(legacyBackfill.summary.protectedWorkspaces)}
          />
          <SummaryFact
            icon={Smartphone}
            label="Recursos"
            value={String(legacyBackfill.summary.totalResources)}
          />
          <SummaryFact
            icon={BadgeDollarSign}
            label="Vagas a criar"
            value={String(legacyBackfill.summary.missingSeats)}
          />
        </div>

        <div className="table-wrap billing-backfill-table">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Instancias</th>
                <th>Canais externos</th>
                <th>Vagas</th>
                <th>Diagnostico</th>
                {isPlatformOwner ? <th>Aplicar</th> : null}
              </tr>
            </thead>
            <tbody>
              {legacyBackfill.workspaces.length ? (
                legacyBackfill.workspaces.map((entry) => (
                  <tr key={entry.workspace.id}>
                    <td>
                      <strong>{entry.workspace.name}</strong>
                      <span>{entry.workspace.slug}</span>
                    </td>
                    <td>{entry.activeInstances}</td>
                    <td>{entry.externalChannels}</td>
                    <td>
                      {entry.existingSeats}/{entry.targetCapacity}
                      {entry.missingSeats
                        ? ` - faltam ${entry.missingSeats}`
                        : ""}
                    </td>
                    <td>
                      <span
                        className={`status-chip${
                          entry.eligible ? "" : " warn"
                        }`}
                      >
                        {entry.protected
                          ? "Protegido"
                          : entry.eligible
                            ? "Pronto"
                            : "Bloqueado"}
                      </span>
                      {entry.issues.map((issue) => (
                        <small
                          key={`${issue.code}-${issue.resourceIds.join()}`}
                        >
                          {issue.severity === "blocking"
                            ? "Bloqueio: "
                            : "Aviso: "}
                          {issue.message}
                        </small>
                      ))}
                    </td>
                    {isPlatformOwner ? (
                      <td>
                        {entry.eligible && !entry.protected ? (
                          <input
                            form="legacy-billing-backfill-form"
                            type="checkbox"
                            name="workspaceId"
                            value={entry.workspace.id}
                            aria-label={`Selecionar ${entry.workspace.name}`}
                          />
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isPlatformOwner ? 6 : 5}>
                    <strong>Nenhum recurso legado encontrado</strong>
                    <span>A base atual nao exige protecao adicional.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isPlatformOwner ? (
          <BackofficeActionForm
            id="legacy-billing-backfill-form"
            action={applyLegacyBillingBackfillAction}
            className="billing-backfill-form"
          >
            <label>
              Confirmacao exata
              <input
                name="confirmation"
                placeholder={legacyBackfill.confirmationPhrase}
                autoComplete="off"
                required
              />
            </label>
            <label>
              Motivo auditavel
              <input name="reason" minLength={10} required />
            </label>
            <PendingSubmitButton
              label="Aplicar nos selecionados"
              pendingLabel="Protegendo..."
              disabled={!legacyBackfill.applyEnabled}
            />
          </BackofficeActionForm>
        ) : null}
      </section>

      <section className="surface-panel billing-admin-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Catalogo comercial</span>
            <h2>Pacotes da plataforma</h2>
            <p className="muted">
              Padrao para venda publica; personalizado, isento e legado sempre
              privados.
            </p>
          </div>
          <span className="status-chip">{plans.length} pacote(s)</span>
        </div>

        {isPlatformOwner ? (
          <details className="client-management-disclosure">
            <summary>
              <span>
                <strong>Criar pacote</strong>
                <small>
                  Defina valor total mensal e quantidade de numeros.
                </small>
              </span>
            </summary>
            <BackofficeActionForm
              action={createPackagePlanAction}
              className="billing-plan-form"
              resetOnSuccess
            >
              <label>
                Nome
                <input name="name" minLength={2} required />
              </label>
              <label>
                Identificador
                <input
                  name="slug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="cliente-3-numeros"
                  required
                />
              </label>
              <label>
                Tipo
                <select name="kind" defaultValue="standard">
                  <option value="standard">Padrao publico</option>
                  <option value="custom">Personalizado</option>
                  <option value="exempt">Isento</option>
                  <option value="legacy_protected">Legado protegido</option>
                </select>
              </label>
              <label>
                Mensalidade (R$)
                <input
                  name="monthlyPrice"
                  inputMode="decimal"
                  defaultValue="0,00"
                  required
                />
              </label>
              <label>
                Numeros incluidos
                <input
                  name="includedWhatsappNumbers"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                />
              </label>
              <label>
                Estado
                <select name="active" defaultValue="true">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
              <label className="billing-field-wide">
                Motivo auditavel
                <input name="reason" minLength={3} required />
              </label>
              <PendingSubmitButton
                label="Criar pacote"
                pendingLabel="Criando..."
              />
            </BackofficeActionForm>
          </details>
        ) : null}

        <div className="billing-plan-list">
          {plans.map((plan) => (
            <details className="billing-plan-row" key={plan.id}>
              <summary>
                <span>
                  <strong>{plan.name}</strong>
                  <small>
                    {plan.slug} - versao {plan.version}
                  </small>
                </span>
                <span>{planKindLabel(plan.kind)}</span>
                <span>{money(plan.monthlyPriceCents)}/mes</span>
                <span>{plan.includedWhatsappNumbers} numero(s)</span>
                <span className={`status-chip${plan.active ? "" : " neutral"}`}>
                  {plan.active ? "Ativo" : "Inativo"}
                </span>
              </summary>
              {isPlatformOwner ? (
                <BackofficeActionForm
                  action={updatePackagePlanAction}
                  className="billing-plan-form"
                >
                  <input type="hidden" name="planId" value={plan.id} />
                  <label>
                    Nome
                    <input name="name" defaultValue={plan.name} required />
                  </label>
                  <label>
                    Visibilidade
                    {plan.kind === "standard" ? (
                      <select name="visibility" defaultValue={plan.visibility}>
                        <option value="public">Publico</option>
                        <option value="private">Privado</option>
                      </select>
                    ) : (
                      <>
                        <input
                          type="hidden"
                          name="visibility"
                          value="private"
                        />
                        <select value="private" disabled>
                          <option value="private">Privado</option>
                        </select>
                      </>
                    )}
                  </label>
                  <label>
                    Mensalidade (R$)
                    <input
                      name="monthlyPrice"
                      defaultValue={(plan.monthlyPriceCents / 100)
                        .toFixed(2)
                        .replace(".", ",")}
                      required
                    />
                  </label>
                  <label>
                    Numeros incluidos
                    <input
                      name="includedWhatsappNumbers"
                      type="number"
                      min={1}
                      defaultValue={plan.includedWhatsappNumbers}
                      required
                    />
                  </label>
                  <label>
                    Estado
                    <select name="active" defaultValue={String(plan.active)}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </label>
                  <label className="billing-field-wide">
                    Motivo da alteracao
                    <input name="reason" minLength={3} required />
                  </label>
                  <PendingSubmitButton
                    label="Salvar nova versao"
                    pendingLabel="Salvando..."
                  />
                </BackofficeActionForm>
              ) : null}
            </details>
          ))}
        </div>
      </section>

      <section className="surface-panel billing-admin-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Contratos por cliente</span>
            <h2>Atribuir pacote</h2>
            <p className="muted">
              Planos pagos aguardam checkout. Isentos e legados entram ativos
              com capacidade protegida.
            </p>
          </div>
        </div>
        {isPlatformOwner ? (
          <BackofficeActionForm
            action={assignPackagePlanAction}
            className="billing-assignment-form"
          >
            <label>
              Workspace
              <select name="workspaceId" required defaultValue="">
                <option value="" disabled>
                  Escolher cliente
                </option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pacote
              <select name="planId" required defaultValue="">
                <option value="" disabled>
                  Escolher pacote
                </option>
                {plans
                  .filter((plan) => plan.active)
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {money(plan.monthlyPriceCents)} -{" "}
                      {plan.includedWhatsappNumbers} numero(s)
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Motivo da negociacao
              <input name="reason" minLength={3} required />
            </label>
            <PendingSubmitButton
              label="Atribuir pacote"
              pendingLabel="Atribuindo..."
            />
          </BackofficeActionForm>
        ) : null}

        <div className="table-wrap billing-contract-table">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Pacote</th>
                <th>Mensal</th>
                <th>Numeros</th>
                <th>Contrato</th>
                <th>Fiscal</th>
                {isPlatformOwner ? <th>Operacao</th> : null}
              </tr>
            </thead>
            <tbody>
              {contracts.length ? (
                contracts.map(({ workspace, contract }) => (
                  <tr key={contract.id}>
                    <td>
                      <strong>{workspace.name}</strong>
                      <span>{workspace.slug}</span>
                    </td>
                    <td>{contract.planName}</td>
                    <td>{money(contract.monthlyPriceCents)}</td>
                    <td>
                      {contract.occupiedWhatsappNumbers}/
                      {contract.includedWhatsappNumbers}
                    </td>
                    <td>
                      <span
                        className={`status-chip${contractStatusTone(
                          contract.status,
                        )}`}
                      >
                        {contractStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td>{fiscalStatusLabel(contract.fiscalStatus)}</td>
                    {isPlatformOwner ? (
                      <td>
                        <BackofficeActionForm
                          action={reconcileWorkspaceBillingAction}
                          className="billing-inline-action"
                        >
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={workspace.id}
                          />
                          <PendingSubmitButton
                            label="Conciliar"
                            pendingLabel="Conferindo..."
                          />
                        </BackofficeActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isPlatformOwner ? 7 : 6}>
                    <strong>Nenhum contrato de pacote</strong>
                    <span>Atribua o primeiro pacote a um workspace.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-panel billing-admin-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Recuperacao fiscal</span>
            <h2>Notas que exigem atencao</h2>
            <p className="muted">
              Pagamentos preservados cuja nota ainda nao foi agendada ou foi
              rejeitada pelo provedor.
            </p>
          </div>
          <span
            className={`status-chip${
              actionableInvoices.length ? " warn" : ""
            }`}
          >
            {actionableInvoices.length} pendencia(s)
          </span>
        </div>

        <div className="table-wrap billing-contract-table">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contrato</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Diagnostico</th>
                {isPlatformOwner ? <th>Operacao</th> : null}
              </tr>
            </thead>
            <tbody>
              {actionableInvoices.length ? (
                actionableInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.workspace.name}</strong>
                      <span>{invoice.workspace.slug}</span>
                    </td>
                    <td>
                      {invoice.subscription.planNameSnapshot ??
                        invoice.subscription.id}
                    </td>
                    <td>{invoice.providerPaymentId ?? "Nao vinculado"}</td>
                    <td>
                      {invoice.amountCents === null
                        ? "Pendente"
                        : money(invoice.amountCents)}
                    </td>
                    <td>
                      <span className="status-chip warn">
                        {fiscalStatusLabel(invoice.status)}
                      </span>
                      <small>
                        {invoice.lastErrorCode ??
                          invoice.subscription.fiscalLastErrorCode ??
                          "Aguardando configuracao"}
                      </small>
                    </td>
                    {isPlatformOwner ? (
                      <td>
                        <BackofficeActionForm
                          action={retryFiscalInvoiceAction}
                          className="billing-inline-action"
                        >
                          <input
                            type="hidden"
                            name="invoiceId"
                            value={invoice.id}
                          />
                          <PendingSubmitButton
                            label="Tentar novamente"
                            pendingLabel="Tentando..."
                          />
                        </BackofficeActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isPlatformOwner ? 6 : 5}>
                    <strong>Nenhuma pendencia fiscal</strong>
                    <span>
                      Notas agendadas, emitidas e autorizadas nao aparecem
                      nesta fila.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-panel billing-admin-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Emissao automatica</span>
            <h2>Nota fiscal de servico</h2>
            <p className="muted">
              A configuracao validada e aplicada apos cada pagamento confirmado
              pelo Asaas.
            </p>
          </div>
          <FileCheck2 aria-hidden="true" size={26} />
        </div>
        {isPlatformOwner ? (
          <BackofficeActionForm
            action={saveFiscalSettingsAction}
            className="billing-fiscal-form"
          >
            <label>
              Emissao
              <select
                name="enabled"
                defaultValue={String(fiscal?.enabled ?? false)}
              >
                <option value="false">Desativada</option>
                <option value="true">Ativa apos pagamento</option>
              </select>
            </label>
            <label>
              ID do servico municipal
              <input
                name="municipalServiceId"
                defaultValue={fiscal?.municipalServiceId ?? ""}
              />
            </label>
            <label>
              Codigo do servico municipal
              <input
                name="municipalServiceCode"
                defaultValue={fiscal?.municipalServiceCode ?? ""}
              />
            </label>
            <label className="billing-field-wide">
              Descricao do servico
              <input
                name="serviceDescription"
                minLength={3}
                defaultValue={
                  fiscal?.serviceDescription ??
                  "Assinatura mensal da plataforma WppTrack"
                }
                required
              />
            </label>
            <label className="billing-field-wide">
              Observacoes
              <textarea
                name="observations"
                defaultValue={fiscal?.observations ?? ""}
              />
            </label>
            <label className="billing-field-wide">
              Motivo da validacao
              <input name="validationReason" minLength={3} required />
            </label>
            <PendingSubmitButton
              label="Validar configuracao fiscal"
              pendingLabel="Validando..."
            />
          </BackofficeActionForm>
        ) : (
          <p className="muted">
            A configuracao fiscal fica visivel apenas para o Platform Owner.
          </p>
        )}
      </section>
    </section>
  );
}

function SummaryFact({
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

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function planKindLabel(kind: WhatsappPackagePlanDto["kind"]): string {
  return {
    standard: "Padrao",
    custom: "Personalizado",
    exempt: "Isento",
    legacy_protected: "Legado protegido",
  }[kind];
}

function contractConsumesCapacity(
  status: WorkspaceSubscriptionContractStatus,
): boolean {
  return !["draft", "awaiting_payment", "canceled"].includes(status);
}

function contractStatusLabel(
  status: WorkspaceSubscriptionContractStatus,
): string {
  return {
    draft: "Rascunho",
    awaiting_payment: "Aguardando pagamento",
    active: "Ativo",
    past_due: "Vencido",
    grace_period: "Tolerancia",
    cancel_at_period_end: "Cancela no fim do periodo",
    suspended: "Suspenso",
    canceled: "Encerrado",
    exempt: "Isento",
    legacy_protected: "Legado protegido",
  }[status];
}

function contractStatusTone(
  status: WorkspaceSubscriptionContractStatus,
): string {
  if (["past_due", "grace_period", "suspended"].includes(status)) {
    return " warn";
  }

  return ["canceled", "cancel_at_period_end"].includes(status)
    ? " neutral"
    : "";
}

function fiscalStatusLabel(
  status: WorkspacePackageSubscriptionDto["fiscalStatus"],
): string {
  return {
    not_configured: "Nao configurada",
    pending_configuration: "Pendente",
    scheduled: "Agendada",
    issued: "Emitida",
    authorized: "Autorizada",
    canceled: "Cancelada",
    failed: "Falhou",
    rejected: "Rejeitada",
  }[status];
}

function emptyLegacyBackfillReport(): LegacyBillingBackfillReportDto {
  return {
    generatedAt: new Date(0).toISOString(),
    applyEnabled: false,
    confirmationPhrase: "APLICAR LEGADO PROTEGIDO",
    summary: {
      workspaces: 0,
      eligibleWorkspaces: 0,
      protectedWorkspaces: 0,
      totalResources: 0,
      activeInstances: 0,
      externalChannels: 0,
      existingSeats: 0,
      missingSeats: 0,
      orphanedSeats: 0,
      blockingIssues: 0,
    },
    workspaces: [],
  };
}
