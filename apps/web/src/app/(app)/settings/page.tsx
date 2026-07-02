import type {
  ConversionRuleDto,
  CurrentWorkspaceDto,
  WorkspaceInviteDto,
  WorkspaceMemberDto
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

type AccountUserDto = {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  emailVerifiedAt: string | null;
};

type AccountSettingsResult = {
  user: AccountUserDto | null;
  state: "real" | "error";
};

type ConversionRulesResult = {
  rules: ConversionRuleDto[];
  state: "real" | "empty" | "error";
};

type WorkspaceSettingsResult = {
  workspace: CurrentWorkspaceDto | null;
  members: WorkspaceMemberDto[];
  invites: WorkspaceInviteDto[];
  state: "real" | "empty" | "error";
};

async function getAccountSettings(): Promise<AccountSettingsResult> {
  try {
    const account = await serverApiFetch<{ user: AccountUserDto }>("/auth/me");

    return {
      user: account.user,
      state: "real"
    };
  } catch {
    return {
      user: null,
      state: "error"
    };
  }
}

async function getConversionRules(): Promise<ConversionRulesResult> {
  try {
    const rules = await serverApiFetch<ConversionRuleDto[]>("/conversion-rules");

    return {
      rules,
      state: rules.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      rules: [],
      state: "error"
    };
  }
}

async function getWorkspaceSettings(): Promise<WorkspaceSettingsResult> {
  try {
    const [workspace, members, invites] = await Promise.all([
      serverApiFetch<CurrentWorkspaceDto>("/workspaces/current"),
      serverApiFetch<WorkspaceMemberDto[]>("/workspaces/current/members"),
      serverApiFetch<WorkspaceInviteDto[]>("/workspaces/current/invites")
    ]);

    return {
      workspace,
      members,
      invites,
      state: members.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      workspace: null,
      members: [],
      invites: [],
      state: "error"
    };
  }
}

function triggerLabel(rule: Pick<ConversionRuleDto, "triggerType">): string {
  return rule.triggerType === "keyword" ? "Palavra-chave" : "Etiqueta WhatsApp";
}

function matchLabel(rule: Pick<ConversionRuleDto, "matchMode" | "triggerValue">): string {
  const mode = rule.matchMode === "exact" ? "igual a" : "contem";
  return `${mode}: ${rule.triggerValue}`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

async function createConversionRule(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "keyword");
  const triggerValue = String(formData.get("triggerValue") ?? "").trim();
  const matchMode = String(formData.get("matchMode") ?? "contains");
  const eventName = String(formData.get("eventName") ?? "LeadSubmitted");
  const pixelId = String(formData.get("pixelId") ?? "").trim();

  if (!name || !triggerValue) {
    return;
  }

  try {
    await serverApiFetch("/conversion-rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        triggerType,
        triggerValue,
        matchMode,
        eventName,
        pixelId: pixelId || null,
        active: true
      })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function createWorkspaceInvite(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  if (!email) {
    return;
  }

  try {
    await serverApiFetch("/workspaces/current/invites", {
      method: "POST",
      body: JSON.stringify({ email, role })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function updateWorkspaceProfile(formData: FormData) {
  "use server";

  const name = String(formData.get("workspaceName") ?? "").trim();

  if (!name) {
    return;
  }

  try {
    await serverApiFetch("/workspaces/current", {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function updateConversionRuleStatus(formData: FormData) {
  "use server";

  const ruleId = String(formData.get("ruleId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!ruleId) {
    return;
  }

  try {
    await serverApiFetch(`/conversion-rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function requestEmailVerification() {
  "use server";

  try {
    await serverApiFetch("/auth/email/verification/start", {
      method: "POST"
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

export default async function SettingsPage() {
  const [workspaceSettings, conversionRules, accountSettings] = await Promise.all([
    getWorkspaceSettings(),
    getConversionRules(),
    getAccountSettings()
  ]);
  const { rules } = conversionRules;
  const { workspace, members, invites } = workspaceSettings;
  const accountUser = accountSettings.user;
  const canManageConversionRules = Boolean(
    workspace?.permissions.canManageIntegrations
  );
  const emptyTitle =
    conversionRules.state === "error"
      ? "Nao foi possivel carregar regras"
      : "Nenhuma regra configurada";
  const emptyDescription =
    conversionRules.state === "error"
      ? "Confira a API antes de alterar mapeamentos de evento."
      : "Crie uma regra por palavra-chave ou etiqueta para iniciar o envio de eventos.";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Workspace e regras</h1>
          <p>Empresa, membros, papeis, palavras-chave, etiquetas e mapeamento de eventos.</p>
        </div>
        <div className="header-actions">
          <span className={`status-chip${workspaceSettings.state === "error" || conversionRules.state === "error" ? " warn" : ""}`}>
            {workspaceSettings.state === "error" || conversionRules.state === "error" ? "API indisponivel" : "API conectada"}
          </span>
          <button className="button" type="button">Testar eventos</button>
        </div>
      </header>

      <div className="config-grid">
        <article className="config-card">
          <span className="micro-label">Workspace</span>
          <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
          <p className="muted">
            {workspace
              ? `Slug ${workspace.slug} com papel ${workspace.role}.`
              : "Confira a API antes de alterar dados da empresa."}
          </p>
          <form className="control-row" action={updateWorkspaceProfile}>
            <label>
              Nome publico
              <input
                defaultValue={workspace?.name ?? ""}
                name="workspaceName"
              />
            </label>
            <label>
              Permissao atual
              <select defaultValue={workspace?.role ?? "member"}>
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={!workspace?.permissions.canInviteMembers}
              type="submit"
            >
              Salvar workspace
            </button>
          </form>
        </article>

        <article className="config-card">
          <span className="micro-label">Conta</span>
          <strong>{accountUser?.email ?? "Conta indisponivel"}</strong>
          <p className="muted">
            {accountSettings.state === "error"
              ? "Nao foi possivel carregar os dados da conta."
              : accountUser?.emailVerifiedAt
                ? "Email verificado"
                : "Email pendente"}
          </p>
          <form className="control-row" action={requestEmailVerification}>
            <label>
              Provedor
              <input
                readOnly
                value={accountUser?.authProvider ?? "indisponivel"}
              />
            </label>
            <label>
              Status
              <input
                readOnly
                value={accountUser?.emailVerifiedAt ? "Email verificado" : "Email pendente"}
              />
            </label>
            <button
              className="button primary"
              disabled={!accountUser || Boolean(accountUser.emailVerifiedAt)}
              type="submit"
            >
              Enviar verificacao
            </button>
          </form>
        </article>

        <article className="config-card">
          <span className="micro-label">Membros</span>
          <strong>
            {workspaceSettings.state === "error"
              ? "Membros indisponiveis"
              : `${members.length} usuario${members.length === 1 ? "" : "s"} ativo${members.length === 1 ? "" : "s"}`}
          </strong>
          <p className="muted">Convites e papeis separados para donos, administradores e operadores.</p>
          {members.length > 0 ? (
            <div className="settings-list">
              {members.map((member) => (
                <div className="quality-card" key={member.id}>
                  <span>
                    <strong>{member.name ?? member.email}</strong>
                    <span>{member.email}</span>
                  </span>
                  <span>{member.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar membros."
                : "Nenhum membro retornado pela API."}
            </p>
          )}
        </article>

        <article className="config-card">
          <span className="micro-label">Convites</span>
          <strong>Convidar membro</strong>
          <p className="muted">O convite e criado no backend e nao concede papel owner diretamente.</p>
          <form className="control-row" action={createWorkspaceInvite}>
            <label>
              Email do convidado
              <input name="email" type="email" placeholder="pessoa@empresa.com" />
            </label>
            <label>
              Papel
              <select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={!workspace?.permissions.canInviteMembers}
              type="submit"
            >
              Enviar convite
            </button>
          </form>
          {invites.length > 0 ? (
            <div className="settings-list">
              {invites.map((invite) => (
                <div className="quality-card" key={invite.id}>
                  <span>
                    <strong>{invite.email}</strong>
                    <span>expira em {shortDate(invite.expiresAt)}</span>
                  </span>
                  <span>{invite.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar convites."
                : "Nenhum convite pendente retornado pela API."}
            </p>
          )}
        </article>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Mapeamento de eventos</span>
        <h2>Etiquetas do WhatsApp viram eventos do Pixel</h2>
        {canManageConversionRules ? (
          <>
            <form className="inline-form" action={createConversionRule}>
              <input name="name" placeholder="Nome da regra" aria-label="Nome da regra" />
              <select name="triggerType" defaultValue="keyword" aria-label="Origem do gatilho">
                <option value="keyword">Palavra-chave</option>
                <option value="whatsapp_label">Etiqueta WhatsApp</option>
              </select>
              <input name="triggerValue" placeholder="Gatilho" aria-label="Gatilho da regra" />
              <select name="matchMode" defaultValue="contains" aria-label="Modo de comparacao">
                <option value="contains">Contem</option>
                <option value="exact">Igual a</option>
              </select>
              <select name="eventName" defaultValue="LeadSubmitted" aria-label="Evento Meta">
                <option value="LeadSubmitted">LeadSubmitted</option>
                <option value="QualifiedLead">QualifiedLead</option>
                <option value="Purchase">Purchase</option>
                <option value="Contact">Contact</option>
                <option value="CompleteRegistration">CompleteRegistration</option>
              </select>
              <input name="pixelId" placeholder="Pixel opcional" aria-label="Pixel opcional" />
              <button className="button primary" type="submit">Criar regra</button>
            </form>
            <p className="muted">Nova regra de conversao</p>
          </>
        ) : (
          <p className="muted">Sem permissao para editar regras</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Regra</th>
                <th>Origem</th>
                <th>Evento Meta</th>
                <th>Gatilho</th>
                <th>Saude</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rules.length > 0 ? (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td><strong>{rule.name}</strong><span>{matchLabel(rule)}</span></td>
                    <td>{triggerLabel(rule)}</td>
                    <td>{rule.eventName}</td>
                    <td>{rule.triggerValue}</td>
                    <td>
                      <span className={`event-chip${rule.active ? "" : " warn"}`}>
                        {rule.active ? "ativo" : "pausado"}
                      </span>
                    </td>
                    <td>
                      {canManageConversionRules ? (
                        <form action={updateConversionRuleStatus}>
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <input type="hidden" name="active" value={String(!rule.active)} />
                          <button className="button" type="submit">
                            {rule.active ? "Pausar" : "Ativar"}
                          </button>
                        </form>
                      ) : (
                        <span className="event-chip warn">sem permissao</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <strong>{emptyTitle}</strong>
                    <span>{emptyDescription}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
