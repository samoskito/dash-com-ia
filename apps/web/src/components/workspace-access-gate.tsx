import type { CurrentWorkspaceDto, WorkspaceListDto } from "@wpptrack/shared";
import type { ReactNode } from "react";
import {
  getAvailableWorkspaces,
  getCurrentWorkspace
} from "../lib/current-workspace";
import { isApiRequestError } from "../lib/server-api";
import { getWhatsappDataSource } from "../lib/whatsapp-data-source";
import { AppShell } from "./app-shell";

export async function WorkspaceAccessGate({
  children
}: {
  children: ReactNode;
}) {
  const [workspaceAccess, workspaces, dataSource] = await Promise.all([
    getWorkspaceAccessState(),
    getWorkspaceListState(),
    getWhatsappDataSource()
  ]);

  if (workspaceAccess.state === "blocked") {
    return (
      <AppShell workspace={workspaceAccess.workspace} workspaces={workspaces}>
        <section className="page-stack">
          <header className="page-header">
            <div>
              <span className="eyebrow">Acesso suspenso</span>
              <h1>Workspace bloqueado</h1>
              <p>
                Fale com o suporte da plataforma para revisar a situacao
                operacional da conta antes de continuar.
              </p>
            </div>
            <div className="header-actions">
              <span className="status-chip warn">bloqueado</span>
            </div>
          </header>
        </section>
      </AppShell>
    );
  }

  if (!workspaceAccess.workspace) {
    const hasMemberships = workspaces.length > 0;

    return (
      <AppShell workspace={null} workspaces={workspaces}>
        <section className="page-stack">
          <header className="page-header">
            <div>
              <span className="eyebrow">Empresas</span>
              <h1>
                {hasMemberships
                  ? "Selecione uma empresa"
                  : "Nenhuma empresa disponivel"}
              </h1>
              <p>
                {hasMemberships
                  ? "Use o seletor no menu para abrir um workspace autorizado."
                  : "Seu acesso ainda nao esta vinculado a um workspace ativo."}
              </p>
            </div>
          </header>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      dataSource={dataSource}
      workspace={workspaceAccess.workspace}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}

async function getWorkspaceListState(): Promise<WorkspaceListDto> {
  try {
    return await getAvailableWorkspaces();
  } catch {
    return [];
  }
}

async function getWorkspaceAccessState(): Promise<
  | { state: "active"; workspace: CurrentWorkspaceDto | null }
  | { state: "blocked"; workspace: CurrentWorkspaceDto | null }
> {
  try {
    const workspace = await getCurrentWorkspace();

    return {
      state: workspace.operationalStatus === "blocked" ? "blocked" : "active",
      workspace
    };
  } catch (error) {
    const blocked =
      isApiRequestError(error) &&
      error.status === 403 &&
      error.message.toLowerCase().includes("workspace bloqueado");

    return {
      state: blocked ? "blocked" : "active",
      workspace: null
    };
  }
}
