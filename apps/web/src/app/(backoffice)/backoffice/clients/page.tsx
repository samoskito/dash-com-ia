import type {
  BackofficeClientWorkspaceDto,
  ClientOwnerAccessResendResultDto,
  ClientWorkspaceProvisionResultDto,
  ExternalConnectionTestResultDto,
  ExternalDataConnectorDto,
  ExternalConnectorHealthDto,
  PlatformUserDto,
} from "@wpptrack/shared";
import { Plus, Search, ShieldCheck, X } from "lucide-react";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BackofficeActionForm,
  type BackofficeActionState,
} from "../../../../components/backoffice-action-form";
import {
  BackofficeClientsNavigation,
  type BackofficeClientsSection,
} from "../../../../components/backoffice-clients-navigation";
import { BackofficeNavigation } from "../../../../components/backoffice-navigation";
import { ExternalConnectorRow } from "../../../../components/external-connector-row";
import { PendingSubmitButton } from "../../../../components/pending-submit-button";
import { SecurePasswordInput } from "../../../../components/secure-password-input";
import { serverApiFetch } from "../../../../lib/server-api";

type SearchParams = Record<string, string | string[] | undefined>;

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

async function getClientWorkspaces(): Promise<
  ResourceResult<BackofficeClientWorkspaceDto[]>
> {
  try {
    const workspaces = await serverApiFetch<BackofficeClientWorkspaceDto[]>(
      "/backoffice/workspaces",
    );

    return {
      data: workspaces,
      state: workspaces.length ? "real" : "empty",
    };
  } catch {
    return { data: [], state: "error" };
  }
}

async function getExternalConnectors(): Promise<
  ResourceResult<ExternalConnectorHealthDto[]>
> {
  try {
    const response = await serverApiFetch<
      Array<ExternalConnectorHealthDto | ExternalDataConnectorDto>
    >("/backoffice/external-data/connectors?includeHealth=true");
    const connectors = response.map((item) =>
      "connector" in item
        ? item
        : {
            connector: item,
            totals: {
              imported: 0,
              duplicates: 0,
              rejected: 0,
              quarantined: 0,
              failed: 0,
              pending: 0,
            },
          },
    );

    return {
      data: connectors,
      state: connectors.length ? "real" : "empty",
    };
  } catch {
    return { data: [], state: "error" };
  }
}

async function getPlatformUsers(): Promise<ResourceResult<PlatformUserDto[]>> {
  try {
    const users = await serverApiFetch<PlatformUserDto[]>(
      "/backoffice/platform-users",
    );

    return {
      data: users,
      state: users.length ? "real" : "empty",
    };
  } catch {
    return { data: [], state: "error" };
  }
}

async function getPlatformSession(): Promise<PlatformSession | null> {
  try {
    return await serverApiFetch<PlatformSession>("/auth/me");
  } catch {
    return null;
  }
}

function actionRedirect(
  message: string,
  type: "success" | "error" = "success",
): never {
  const params = new URLSearchParams({ notice: message, noticeType: type });
  redirect(`/backoffice/clients?${params.toString()}`);
}

function actionResult(
  status: "success" | "error",
  message: string,
  syncRequest?: BackofficeActionState["syncRequest"],
): BackofficeActionState {
  return {
    status,
    message,
    nonce: Date.now(),
    ...(syncRequest ? { syncRequest } : {}),
  };
}

async function provisionClient(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  try {
    const result = await serverApiFetch<ClientWorkspaceProvisionResultDto>(
      "/backoffice/workspaces",
      {
        method: "POST",
        body: JSON.stringify({
          workspaceName: String(formData.get("workspaceName") ?? "").trim(),
          ownerName: String(formData.get("ownerName") ?? "").trim(),
          ownerEmail: String(formData.get("ownerEmail") ?? "").trim(),
        }),
      },
    );
    revalidatePath("/backoffice/clients");

    if (result.access.delivery === "failed") {
      return actionResult(
        "success",
        "Cliente criado, mas o email nao foi enfileirado. Use Reenviar acesso.",
      );
    }

    if (result.access.delivery === "not_configured") {
      return actionResult(
        "success",
        "Cliente criado. O email esta desativado; use Reenviar acesso apos configurar o envio.",
      );
    }

    return actionResult(
      "success",
      result.access.mode === "activation"
        ? "Cliente criado e email para criar a senha enfileirado."
        : "Cliente criado e novo workspace comunicado ao responsavel.",
    );
  } catch {
    return actionResult("error", "Nao foi possivel criar o cliente");
  }
}

async function resendOwnerAccess(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const ownerUserId = String(formData.get("ownerUserId") ?? "");

  let result: ClientOwnerAccessResendResultDto;

  try {
    result = await serverApiFetch<ClientOwnerAccessResendResultDto>(
      `/backoffice/workspaces/${encodeURIComponent(workspaceId)}/owners/${encodeURIComponent(ownerUserId)}/access-email`,
      { method: "POST" },
    );
  } catch {
    actionRedirect("Nao foi possivel reenviar o acesso", "error");
  }

  if (result.access.delivery === "email_queued") {
    actionRedirect(
      result.access.mode === "activation"
        ? "Novo link para criar a senha foi enfileirado"
        : "Aviso de acesso ao workspace foi enfileirado",
    );
  }

  actionRedirect(
    result.access.delivery === "not_configured"
      ? "O envio de email nao esta configurado"
      : "Nao foi possivel enfileirar o email de acesso",
    "error",
  );
}

async function startSupportAccess(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await serverApiFetch(
      `/backoffice/workspaces/${encodeURIComponent(workspaceId)}/support-access`,
      { method: "POST" },
    );
  } catch {
    actionRedirect("Nao foi possivel acessar o workspace", "error");
  }

  redirect("/overview");
}

async function createPlatformUser(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  try {
    await serverApiFetch("/backoffice/platform-users", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        role: String(formData.get("role") ?? "platform_operator"),
      }),
    });
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult(
      "error",
      "Nao foi possivel criar o usuario da plataforma",
    );
  }

  return actionResult("success", "Usuario interno criado com sucesso");
}

async function createExternalConnector(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const averageValue = Number(
    String(formData.get("purchaseAverageValue") ?? "").replace(",", "."),
  );

  try {
    await serverApiFetch("/backoffice/external-data/connectors", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: String(formData.get("workspaceId") ?? ""),
        name: String(formData.get("name") ?? "").trim(),
        provider: "kinbox_mysql",
        timezone: "America/Sao_Paulo",
        sslMode: String(formData.get("sslMode") ?? "required"),
        credentials: {
          host: String(formData.get("host") ?? "").trim(),
          port: Number(formData.get("port") ?? 3306),
          database: String(formData.get("database") ?? "").trim(),
          username: String(formData.get("username") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
        },
        syncEnabled: false,
        shadowMode: true,
        capiSendEnabled: false,
        purchaseAverageValueCents:
          Number.isFinite(averageValue) && averageValue > 0
            ? Math.round(averageValue * 100)
            : null,
        defaultCurrency: "BRL",
      }),
    });
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult("error", "Nao foi possivel salvar o conector");
  }

  return actionResult("success", "Conector salvo em modo sombra");
}

async function testExternalConnector(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");
  let connectionOk = false;

  try {
    const result = await serverApiFetch<ExternalConnectionTestResultDto>(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/test`,
      { method: "POST" },
    );
    connectionOk = result.ok;
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult("error", "Nao foi possivel testar o conector");
  }

  if (!connectionOk) {
    return actionResult(
      "error",
      "Conexao recusada ou views obrigatorias ausentes",
    );
  }

  return actionResult("success", "Conexao e views validadas");
}

async function activateExternalConnector(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");

  try {
    await serverApiFetch(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "active",
          syncEnabled: true,
          shadowMode: true,
          capiSendEnabled: false,
        }),
      },
    );
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult("error", "Nao foi possivel ativar o conector");
  }

  return actionResult(
    "success",
    "Sincronizacao automatica ativada em modo sombra",
  );
}

async function syncExternalConnector(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");
  const reimportLeads = String(formData.get("reimportLeads") ?? "") === "true";
  const requestedAt = Date.now();

  try {
    await serverApiFetch(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/${
        reimportLeads ? "reimport-leads" : "sync"
      }`,
      {
        method: "POST",
        ...(reimportLeads
          ? {}
          : { body: JSON.stringify({ streams: ["leads", "events"] }) }),
      },
    );
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult("error", "Nao foi possivel iniciar a sincronizacao");
  }

  return actionResult(
    "success",
    reimportLeads
      ? "Reimportacao de leads adicionada a fila"
      : "Sincronizacao adicionada a fila",
    { connectorId, requestedAt },
  );
}

async function activateExternalCapiCutover(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");
  const eventType = String(formData.get("eventType") ?? "");
  const expectedOperationalRows = Number(
    formData.get("expectedOperationalRows") ?? -1,
  );
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  try {
    await serverApiFetch(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/capi-cutover`,
      {
        method: "POST",
        body: JSON.stringify({
          eventType,
          expectedOperationalRows,
          confirmation,
        }),
      },
    );
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult(
      "error",
      "O corte nao foi ativado. Atualize o gate, confira os bloqueios e tente novamente",
    );
  }

  return actionResult(
    "success",
    "WppTrack assumiu este evento. Desative agora somente o no de envio Meta correspondente no n8n",
  );
}

async function rollbackExternalCapiCutover(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");
  const eventType = String(formData.get("eventType") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  try {
    await serverApiFetch(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/capi-cutover/rollback`,
      {
        method: "POST",
        body: JSON.stringify({ eventType, confirmation }),
      },
    );
    revalidatePath("/backoffice/clients");
  } catch {
    return actionResult(
      "error",
      "O rollback nao foi concluido. Reative primeiro o envio correspondente no n8n",
    );
  }

  return actionResult(
    "success",
    "Envio devolvido ao n8n para este tipo de evento",
  );
}

async function getExternalConnectorHealth(
  connectorId: string,
): Promise<ExternalConnectorHealthDto | null> {
  "use server";

  try {
    return await serverApiFetch<ExternalConnectorHealthDto>(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/health`,
    );
  } catch {
    return null;
  }
}

function stringParam(value: string | string[] | undefined): string | null {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved?.trim() || null;
}

function normalizeClientsSection(
  value: string | null,
): BackofficeClientsSection {
  return value === "connectors" || value === "team" || value === "workspaces"
    ? value
    : "workspaces";
}

function normalizeClientSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export default async function BackofficeClientsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeSection = normalizeClientsSection(
    stringParam(resolvedSearchParams.section),
  );
  const clientSearch = stringParam(resolvedSearchParams.q);
  const [workspacesResult, connectorsResult, platformUsersResult, session] =
    await Promise.all([
      getClientWorkspaces(),
      getExternalConnectors(),
      getPlatformUsers(),
      getPlatformSession(),
    ]);
  const workspaces = workspacesResult.data;
  const normalizedClientSearch = clientSearch
    ? normalizeClientSearch(clientSearch)
    : null;
  const visibleWorkspaces = normalizedClientSearch
    ? workspaces.filter((workspace) =>
        [workspace.name, ...workspace.owners.map((owner) => owner.name ?? "")]
          .map(normalizeClientSearch)
          .some((value) => value.includes(normalizedClientSearch)),
      )
    : workspaces;
  const connectorHealth = connectorsResult.data;
  const platformUsers = platformUsersResult.data;
  const workspaceNames = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name]),
  );
  const notice = stringParam(resolvedSearchParams.notice);
  const noticeType = stringParam(resolvedSearchParams.noticeType);
  const isPlatformOwner = session?.user.platformRole === "platform_owner";
  const activeConnectors = connectorHealth.filter(
    ({ connector }) => connector.status === "active",
  ).length;
  const activeCapiCutovers = connectorHealth.reduce(
    (total, { connector }) => total + connector.capiCutovers.length,
    0,
  );
  const emptyWorkspaceTitle =
    clientSearch && workspaces.length
      ? "Nenhum cliente encontrado"
      : workspacesResult.state === "error"
        ? "Nao foi possivel carregar os workspaces"
        : "Nenhum cliente provisionado";
  const emptyWorkspaceDetail =
    clientSearch && workspaces.length
      ? "Tente outro nome ou limpe a pesquisa."
      : "Use o controle acima para criar o primeiro ambiente.";

  return (
    <section className="page-stack standalone-page client-admin-page">
      <BackofficeNavigation active="clients" />

      <header className="page-header client-admin-header">
        <div>
          <span className="eyebrow">Operacao da plataforma</span>
          <h1>Clientes e acessos</h1>
          <p>
            Provisionamento isolado, suporte auditado e fontes externas por
            workspace.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-chip">
            {session?.user.platformRole === "platform_owner"
              ? "Platform Owner"
              : "Operador"}
          </span>
        </div>
      </header>

      {notice ? (
        <div
          className={`action-notice${noticeType === "error" ? " error" : ""}`}
          role="status"
        >
          <strong>
            {noticeType === "error" ? "Acao nao concluida" : "Concluido"}
          </strong>
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="client-admin-summary" aria-label="Resumo de clientes">
        <div>
          <span>Workspaces</span>
          <strong>{workspaces.length}</strong>
        </div>
        <div>
          <span>Conectores ativos</span>
          <strong>{activeConnectors}</strong>
        </div>
        <div>
          <span>Equipe interna</span>
          <strong>{platformUsers.length}</strong>
        </div>
        <div>
          <span>Modo de ingestao</span>
          <strong>
            {activeCapiCutovers
              ? `${activeCapiCutovers} corte(s) CAPI`
              : "Sombra"}
          </strong>
        </div>
      </div>

      <BackofficeClientsNavigation activeSection={activeSection} />

      {activeSection === "workspaces" ? (
        <section className="surface-panel client-workspaces-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Workspaces</span>
              <h2>Ambientes dos clientes</h2>
              <p className="muted">
                Responsaveis, estado operacional e acesso de suporte por conta.
              </p>
            </div>
            <span className="status-chip">
              {clientSearch
                ? `${visibleWorkspaces.length} de ${workspaces.length}`
                : `${workspaces.length} cadastrados`}
            </span>
          </div>

          <details
            className="client-management-disclosure"
            open={!workspaces.length}
          >
            <summary>
              <span
                className="client-management-disclosure-icon"
                aria-hidden="true"
              >
                <Plus size={17} strokeWidth={2} />
              </span>
              <span>
                <strong>Provisionar workspace</strong>
                <small>
                  Crie o ambiente e o responsavel principal da conta.
                </small>
              </span>
            </summary>
            <BackofficeActionForm
              className="client-admin-form"
              action={provisionClient}
              resetOnSuccess
            >
              <label>
                Nome do workspace
                <input name="workspaceName" required minLength={2} />
              </label>
              <label>
                Nome do responsavel
                <input name="ownerName" required minLength={2} />
              </label>
              <label>
                Email do responsavel
                <input name="ownerEmail" type="email" required />
              </label>
              <div className="form-command-row">
                <span>
                  O responsavel recebe um link seguro para criar a propria
                  senha.
                </span>
                <PendingSubmitButton
                  label="Criar cliente"
                  pendingLabel="Criando cliente..."
                />
              </div>
            </BackofficeActionForm>
          </details>

          <form
            action="/backoffice/clients"
            className="client-workspace-search"
            role="search"
          >
            <input type="hidden" name="section" value="workspaces" />
            <label className="client-workspace-search-field">
              <span className="sr-only">Buscar cliente por nome</span>
              <Search aria-hidden="true" size={16} strokeWidth={2} />
              <input
                name="q"
                type="search"
                defaultValue={clientSearch ?? ""}
                placeholder="Nome do workspace ou responsavel"
                autoComplete="off"
              />
            </label>
            <button className="button ghost compact-button" type="submit">
              <Search aria-hidden="true" size={15} strokeWidth={2} />
              Buscar
            </button>
            {clientSearch ? (
              <Link
                className="button ghost compact-button"
                href="/backoffice/clients?section=workspaces"
              >
                <X aria-hidden="true" size={15} strokeWidth={2} />
                Limpar
              </Link>
            ) : null}
            <span className="client-workspace-search-result" aria-live="polite">
              {clientSearch
                ? `${visibleWorkspaces.length} resultado(s)`
                : `${workspaces.length} cliente(s)`}
            </span>
          </form>

          <div className="table-wrap client-workspaces-table">
            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Responsavel da conta</th>
                  <th>Conectores</th>
                  <th>Status</th>
                  <th>Acesso</th>
                  <th>Suporte</th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkspaces.length ? (
                  visibleWorkspaces.map((workspace) => (
                    <tr key={workspace.id}>
                      <td>
                        <strong>{workspace.name}</strong>
                        <span>{workspace.slug}</span>
                      </td>
                      <td>
                        <strong>
                          {workspace.owners[0]?.name ?? "Sem owner"}
                        </strong>
                        <span>
                          {workspace.owners[0]?.email ?? "Nao configurado"}
                        </span>
                      </td>
                      <td>{workspace.connectorCount}</td>
                      <td>
                        <span
                          className={`event-chip${
                            workspace.operationalStatus === "blocked"
                              ? " warn"
                              : ""
                          }`}
                        >
                          {workspace.operationalStatus === "active"
                            ? "Ativo"
                            : "Bloqueado"}
                        </span>
                      </td>
                      <td>
                        {workspace.owners[0] ? (
                          <form action={resendOwnerAccess}>
                            <input
                              type="hidden"
                              name="workspaceId"
                              value={workspace.id}
                            />
                            <input
                              type="hidden"
                              name="ownerUserId"
                              value={workspace.owners[0].id}
                            />
                            <PendingSubmitButton
                              label="Enviar e-mail de acesso"
                              pendingLabel="Enviando..."
                              className="button ghost compact-button"
                            />
                          </form>
                        ) : (
                          <span>Nao disponivel</span>
                        )}
                      </td>
                      <td>
                        <form action={startSupportAccess}>
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={workspace.id}
                          />
                          <PendingSubmitButton
                            label="Acessar"
                            pendingLabel="Abrindo..."
                            className="button ghost compact-button"
                          />
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <strong>{emptyWorkspaceTitle}</strong>
                      <span>{emptyWorkspaceDetail}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="client-workspace-mobile-list" aria-label="Workspaces">
            {visibleWorkspaces.length ? (
              visibleWorkspaces.map((workspace) => (
                <article
                  className="client-workspace-mobile-card"
                  key={workspace.id}
                >
                  <div className="client-workspace-mobile-heading">
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>{workspace.slug}</small>
                    </span>
                    <span
                      className={`event-chip${
                        workspace.operationalStatus === "blocked" ? " warn" : ""
                      }`}
                    >
                      {workspace.operationalStatus === "active"
                        ? "Ativo"
                        : "Bloqueado"}
                    </span>
                  </div>

                  <dl className="client-workspace-mobile-facts">
                    <div>
                      <dt>Responsavel</dt>
                      <dd>
                        <strong>
                          {workspace.owners[0]?.name ?? "Sem responsavel"}
                        </strong>
                        <span>
                          {workspace.owners[0]?.email ?? "Nao configurado"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Conectores</dt>
                      <dd>{workspace.connectorCount}</dd>
                    </div>
                  </dl>

                  <div className="client-workspace-mobile-actions">
                    {workspace.owners[0] ? (
                      <form action={resendOwnerAccess}>
                        <input
                          type="hidden"
                          name="workspaceId"
                          value={workspace.id}
                        />
                        <input
                          type="hidden"
                          name="ownerUserId"
                          value={workspace.owners[0].id}
                        />
                        <PendingSubmitButton
                          label="Enviar e-mail de acesso"
                          pendingLabel="Enviando..."
                          className="button ghost compact-button"
                        />
                      </form>
                    ) : null}
                    <form action={startSupportAccess}>
                      <input
                        type="hidden"
                        name="workspaceId"
                        value={workspace.id}
                      />
                      <PendingSubmitButton
                        label="Acessar workspace"
                        pendingLabel="Abrindo..."
                        className="button ghost compact-button"
                      />
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state compact">
                <strong>{emptyWorkspaceTitle}</strong>
                <span>{emptyWorkspaceDetail}</span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "team" ? (
        <section className="surface-panel platform-team-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Equipe interna</span>
              <h2>Acesso global da plataforma</h2>
              <p className="muted">
                Usuarios internos nao aparecem nas equipes dos clientes.
              </p>
            </div>
            <span className="status-chip">
              <ShieldCheck aria-hidden="true" size={14} strokeWidth={2} />
              {platformUsers.length} usuario(s)
            </span>
          </div>

          {isPlatformOwner ? (
            <details
              className="client-management-disclosure"
              open={!platformUsers.length}
            >
              <summary>
                <span
                  className="client-management-disclosure-icon"
                  aria-hidden="true"
                >
                  <Plus size={17} strokeWidth={2} />
                </span>
                <span>
                  <strong>Criar acesso interno</strong>
                  <small>Adicione um operador ou outro Platform Owner.</small>
                </span>
              </summary>
              <BackofficeActionForm
                className="client-admin-form"
                action={createPlatformUser}
                resetOnSuccess
              >
                <label>
                  Nome
                  <input name="name" required minLength={2} />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>
                <SecurePasswordInput label="Senha inicial" name="password" />
                <label>
                  Nivel de acesso
                  <select name="role" defaultValue="platform_operator">
                    <option value="platform_operator">
                      Operador da plataforma
                    </option>
                    <option value="platform_owner">
                      Proprietario da plataforma
                    </option>
                  </select>
                </label>
                <div className="form-command-row">
                  <span>
                    Somente proprietarios podem criar acessos internos.
                  </span>
                  <PendingSubmitButton
                    label="Criar acesso"
                    pendingLabel="Criando acesso..."
                    className="button ghost"
                  />
                </div>
              </BackofficeActionForm>
            </details>
          ) : (
            <div className="empty-state compact">
              <strong>Gestao restrita</strong>
              <span>Somente o Platform Owner gerencia a equipe interna.</span>
            </div>
          )}

          <div className="operator-list client-operator-list">
            {platformUsers.length ? (
              platformUsers.map((user) => (
                <div key={user.id}>
                  <span>
                    <strong>{user.name ?? "Usuario interno"}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span className="event-chip">
                    {user.role === "platform_owner" ? "Owner" : "Operador"}
                  </span>
                </div>
              ))
            ) : (
              <div>
                <span>
                  <strong>Nenhum usuario interno</strong>
                  <small>Crie o primeiro acesso global da plataforma.</small>
                </span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "connectors" ? (
        <section className="surface-panel external-connectors-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Fontes externas</span>
              <h2>Conectores MySQL</h2>
              <p className="muted">
                Credenciais criptografadas, leitura incremental e CAPI desligada
                durante a reconciliacao.
              </p>
            </div>
            <span className="status-chip">Somente leitura</span>
          </div>

          <details
            className="connector-create-disclosure"
            open={!connectorHealth.length}
          >
            <summary>Adicionar conector</summary>
            <BackofficeActionForm
              className="connector-form"
              action={createExternalConnector}
              resetOnSuccess
            >
              <label>
                Workspace
                <select name="workspaceId" required defaultValue="">
                  <option value="" disabled>
                    Selecione o cliente
                  </option>
                  {workspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome do conector
                <input name="name" required placeholder="MySQL Barbieri" />
              </label>
              <label>
                Host
                <input name="host" required inputMode="url" />
              </label>
              <label>
                Porta externa
                <input
                  name="port"
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={43306}
                  required
                />
              </label>
              <label>
                Banco
                <input name="database" defaultValue="tracking" required />
              </label>
              <label>
                Usuario somente leitura
                <input
                  name="username"
                  defaultValue="wpptrack_reader"
                  required
                />
              </label>
              <SecurePasswordInput
                label="Senha do usuario somente leitura"
                name="password"
                autoComplete="off"
              />
              <label>
                SSL
                <select name="sslMode" defaultValue="required">
                  <option value="required">Obrigatorio</option>
                  <option value="verify_identity">Validar certificado</option>
                  <option value="disabled">Desativado</option>
                </select>
              </label>
              <label>
                Ticket medio estimado
                <input
                  name="purchaseAverageValue"
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </label>
              <div className="form-command-row connector-command-row">
                <span>O conector nasce inativo e em modo sombra.</span>
                <PendingSubmitButton
                  label="Salvar conector"
                  pendingLabel="Criptografando..."
                />
              </div>
            </BackofficeActionForm>
          </details>

          <div className="connector-list">
            {connectorHealth.length ? (
              connectorHealth.map((health) => (
                <ExternalConnectorRow
                  key={health.connector.id}
                  initialHealth={health}
                  workspaceName={
                    workspaceNames.get(health.connector.workspaceId) ??
                    "Workspace"
                  }
                  testAction={testExternalConnector}
                  activateAction={activateExternalConnector}
                  syncAction={syncExternalConnector}
                  activateCutoverAction={activateExternalCapiCutover}
                  rollbackCutoverAction={rollbackExternalCapiCutover}
                  loadHealthAction={getExternalConnectorHealth}
                />
              ))
            ) : (
              <div className="empty-state compact">
                <strong>
                  {connectorsResult.state === "error"
                    ? "Nao foi possivel carregar os conectores"
                    : "Nenhum conector cadastrado"}
                </strong>
                <span>
                  Salve e teste a fonte antes de ativar a sincronizacao.
                </span>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
