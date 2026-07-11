import type {
  BackofficeClientWorkspaceDto,
  ExternalConnectionTestResultDto,
  ExternalDataConnectorDto,
  PlatformUserDto
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
      "/backoffice/workspaces"
    );

    return {
      data: workspaces,
      state: workspaces.length ? "real" : "empty"
    };
  } catch {
    return { data: [], state: "error" };
  }
}

async function getExternalConnectors(): Promise<
  ResourceResult<ExternalDataConnectorDto[]>
> {
  try {
    const connectors = await serverApiFetch<ExternalDataConnectorDto[]>(
      "/backoffice/external-data/connectors"
    );

    return {
      data: connectors,
      state: connectors.length ? "real" : "empty"
    };
  } catch {
    return { data: [], state: "error" };
  }
}

async function getPlatformUsers(): Promise<ResourceResult<PlatformUserDto[]>> {
  try {
    const users = await serverApiFetch<PlatformUserDto[]>(
      "/backoffice/platform-users"
    );

    return {
      data: users,
      state: users.length ? "real" : "empty"
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

function actionRedirect(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ notice: message, noticeType: type });
  redirect(`/backoffice/clients?${params.toString()}`);
}

async function provisionClient(formData: FormData) {
  "use server";

  try {
    await serverApiFetch("/backoffice/workspaces", {
      method: "POST",
      body: JSON.stringify({
        workspaceName: String(formData.get("workspaceName") ?? "").trim(),
        ownerName: String(formData.get("ownerName") ?? "").trim(),
        ownerEmail: String(formData.get("ownerEmail") ?? "").trim(),
        ownerPassword: String(formData.get("ownerPassword") ?? "")
      })
    });
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel criar o cliente", "error");
  }

  actionRedirect("Cliente e administrador criados com sucesso");
}

async function startSupportAccess(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await serverApiFetch(
      `/backoffice/workspaces/${encodeURIComponent(workspaceId)}/support-access`,
      { method: "POST" }
    );
  } catch {
    actionRedirect("Nao foi possivel acessar o workspace", "error");
  }

  redirect("/overview");
}

async function createPlatformUser(formData: FormData) {
  "use server";

  try {
    await serverApiFetch("/backoffice/platform-users", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        role: String(formData.get("role") ?? "platform_operator")
      })
    });
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel criar o usuario da plataforma", "error");
  }

  actionRedirect("Usuario interno criado com sucesso");
}

async function createExternalConnector(formData: FormData) {
  "use server";

  const averageValue = Number(
    String(formData.get("purchaseAverageValue") ?? "").replace(",", ".")
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
          password: String(formData.get("password") ?? "")
        },
        syncEnabled: false,
        shadowMode: true,
        capiSendEnabled: false,
        purchaseAverageValueCents:
          Number.isFinite(averageValue) && averageValue > 0
            ? Math.round(averageValue * 100)
            : null,
        defaultCurrency: "BRL"
      })
    });
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel salvar o conector", "error");
  }

  actionRedirect("Conector salvo em modo sombra");
}

async function testExternalConnector(formData: FormData) {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");
  let connectionOk = false;

  try {
    const result = await serverApiFetch<ExternalConnectionTestResultDto>(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/test`,
      { method: "POST" }
    );
    connectionOk = result.ok;
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel testar o conector", "error");
  }

  if (!connectionOk) {
    actionRedirect("Conexao recusada ou views obrigatorias ausentes", "error");
  }

  actionRedirect("Conexao e views validadas");
}

async function activateExternalConnector(formData: FormData) {
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
          capiSendEnabled: false
        })
      }
    );
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel ativar o conector", "error");
  }

  actionRedirect("Sincronizacao automatica ativada em modo sombra");
}

async function syncExternalConnector(formData: FormData) {
  "use server";

  const connectorId = String(formData.get("connectorId") ?? "");

  try {
    await serverApiFetch(
      `/backoffice/external-data/connectors/${encodeURIComponent(connectorId)}/sync`,
      {
        method: "POST",
        body: JSON.stringify({ streams: ["leads", "events"] })
      }
    );
    revalidatePath("/backoffice/clients");
  } catch {
    actionRedirect("Nao foi possivel iniciar a sincronizacao", "error");
  }

  actionRedirect("Sincronizacao adicionada a fila");
}

function stringParam(value: string | string[] | undefined): string | null {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved?.trim() || null;
}

function formatDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("pt-BR")
    : "Ainda nao executado";
}

function connectorStatusLabel(connector: ExternalDataConnectorDto): string {
  if (connector.lastConnectionStatus === "connected") {
    return connector.status === "active" ? "Ativo" : "Conexao validada";
  }

  if (connector.lastConnectionStatus === "failed") {
    return "Falha na conexao";
  }

  return "Aguardando teste";
}

export default async function BackofficeClientsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [workspacesResult, connectorsResult, platformUsersResult, session] =
    await Promise.all([
      getClientWorkspaces(),
      getExternalConnectors(),
      getPlatformUsers(),
      getPlatformSession()
    ]);
  const workspaces = workspacesResult.data;
  const connectors = connectorsResult.data;
  const platformUsers = platformUsersResult.data;
  const workspaceNames = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name])
  );
  const notice = stringParam(resolvedSearchParams.notice);
  const noticeType = stringParam(resolvedSearchParams.noticeType);
  const isPlatformOwner = session?.user.platformRole === "platform_owner";
  const activeConnectors = connectors.filter(
    (connector) => connector.status === "active"
  ).length;

  return (
    <section className="page-stack standalone-page client-admin-page">
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
          <a className="button ghost" href="/backoffice">
            Voltar ao backoffice
          </a>
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
          <strong>{noticeType === "error" ? "Acao nao concluida" : "Concluido"}</strong>
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
          <strong>Sombra</strong>
        </div>
      </div>

      <div className="client-admin-columns">
        <section className="surface-panel client-provision-panel">
          <span className="eyebrow">Novo cliente</span>
          <h2>Provisionar workspace</h2>
          <p className="muted">
            Cria o ambiente e o primeiro administrador em uma unica operacao.
          </p>
          <form className="client-admin-form" action={provisionClient}>
            <label>
              Nome do workspace
              <input name="workspaceName" required minLength={2} />
            </label>
            <label>
              Nome do administrador
              <input name="ownerName" required minLength={2} />
            </label>
            <label>
              Email do administrador
              <input name="ownerEmail" type="email" required />
            </label>
            <SecurePasswordInput
              label="Senha inicial"
              name="ownerPassword"
            />
            <div className="form-command-row">
              <span>O cliente podera convidar a propria equipe depois.</span>
              <PendingSubmitButton
                label="Criar cliente"
                pendingLabel="Criando cliente..."
              />
            </div>
          </form>
        </section>

        <section className="surface-panel platform-team-panel">
          <span className="eyebrow">Equipe interna</span>
          <h2>Acesso global</h2>
          <p className="muted">
            Usuarios internos nao aparecem nas equipes dos clientes.
          </p>
          {isPlatformOwner ? (
            <form className="client-admin-form" action={createPlatformUser}>
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
                  <option value="platform_operator">Operador da plataforma</option>
                  <option value="platform_owner">Proprietario da plataforma</option>
                </select>
              </label>
              <div className="form-command-row">
                <span>Somente proprietarios podem criar acessos internos.</span>
                <PendingSubmitButton
                  label="Criar acesso"
                  pendingLabel="Criando acesso..."
                  className="button ghost"
                />
              </div>
            </form>
          ) : (
            <div className="empty-state compact">
              <strong>Gestao restrita</strong>
              <span>Somente o Platform Owner gerencia a equipe interna.</span>
            </div>
          )}
          <div className="operator-list">
            {platformUsers.map((user) => (
              <div key={user.id}>
                <span>
                  <strong>{user.name ?? "Usuario interno"}</strong>
                  <small>{user.email}</small>
                </span>
                <span className="event-chip">
                  {user.role === "platform_owner" ? "Owner" : "Operador"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Workspaces</span>
            <h2>Ambientes dos clientes</h2>
          </div>
          <span className="status-chip">{workspaces.length} cadastrados</span>
        </div>
        <div className="table-wrap client-workspaces-table">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Administrador</th>
                <th>Conectores</th>
                <th>Status</th>
                <th>Suporte</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.length ? (
                workspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <strong>{workspace.name}</strong>
                      <span>{workspace.slug}</span>
                    </td>
                    <td>
                      <strong>{workspace.owners[0]?.name ?? "Sem owner"}</strong>
                      <span>{workspace.owners[0]?.email ?? "Nao configurado"}</span>
                    </td>
                    <td>{workspace.connectorCount}</td>
                    <td>
                      <span
                        className={`event-chip${
                          workspace.operationalStatus === "blocked" ? " warn" : ""
                        }`}
                      >
                        {workspace.operationalStatus === "active" ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td>
                      <form action={startSupportAccess}>
                        <input type="hidden" name="workspaceId" value={workspace.id} />
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
                  <td colSpan={5}>
                    <strong>
                      {workspacesResult.state === "error"
                        ? "Nao foi possivel carregar os workspaces"
                        : "Nenhum cliente provisionado"}
                    </strong>
                    <span>Use o formulario acima para criar o primeiro ambiente.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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

        <details className="connector-create-disclosure" open={!connectors.length}>
          <summary>Adicionar conector</summary>
          <form className="connector-form" action={createExternalConnector}>
            <label>
              Workspace
              <select name="workspaceId" required defaultValue="">
                <option value="" disabled>Selecione o cliente</option>
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
              <input name="port" type="number" min={1} max={65535} defaultValue={43306} required />
            </label>
            <label>
              Banco
              <input name="database" defaultValue="tracking" required />
            </label>
            <label>
              Usuario somente leitura
              <input name="username" defaultValue="wpptrack_reader" required />
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
          </form>
        </details>

        <div className="connector-list">
          {connectors.length ? (
            connectors.map((connector) => (
              <article key={connector.id} className="connector-row">
                <div className="connector-identity">
                  <span className="micro-label">
                    {workspaceNames.get(connector.workspaceId) ?? "Workspace"}
                  </span>
                  <strong>{connector.name}</strong>
                  <small>{connector.provider} - SSL {connector.sslMode}</small>
                </div>
                <div className="connector-health-copy">
                  <span
                    className={`event-chip${
                      connector.lastConnectionStatus === "failed" ? " warn" : ""
                    }`}
                  >
                    {connectorStatusLabel(connector)}
                  </span>
                  <small>Teste: {formatDate(connector.lastConnectionTestAt)}</small>
                  <small>Sync: {formatDate(connector.lastSyncCompletedAt)}</small>
                </div>
                <div className="connector-actions">
                  <form action={testExternalConnector}>
                    <input type="hidden" name="connectorId" value={connector.id} />
                    <PendingSubmitButton
                      label="Testar"
                      pendingLabel="Testando..."
                      className="button ghost compact-button"
                    />
                  </form>
                  {connector.lastConnectionStatus === "connected" &&
                  connector.status !== "active" ? (
                    <form action={activateExternalConnector}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <PendingSubmitButton
                        label="Ativar sombra"
                        pendingLabel="Ativando..."
                        className="button ghost compact-button"
                      />
                    </form>
                  ) : null}
                  {connector.status === "active" ? (
                    <form action={syncExternalConnector}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <PendingSubmitButton
                        label="Sincronizar"
                        pendingLabel="Enfileirando..."
                        className="button compact-button"
                      />
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state compact">
              <strong>
                {connectorsResult.state === "error"
                  ? "Nao foi possivel carregar os conectores"
                  : "Nenhum conector cadastrado"}
              </strong>
              <span>Salve e teste a fonte antes de ativar a sincronizacao.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
