import type { CurrentWorkspaceDto, WorkspaceListDto } from "@wpptrack/shared";
import {
  clientNavVisibleForPermissions,
  type ClientNavId,
} from "@wpptrack/shared";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  getAvailableWorkspaces,
  getCurrentWorkspace,
  getWorkspacePackageAccess,
} from "../lib/current-workspace";
import { isApiRequestError } from "../lib/server-api";
import { getWhatsappDataSource } from "../lib/whatsapp-data-source";
import { AppShell } from "./app-shell";

export async function WorkspaceAccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const [workspaceAccess, workspaces, pathname] = await Promise.all([
    getWorkspaceAccessState(),
    getWorkspaceListState(),
    getRequestPathname(),
  ]);

  if (workspaceAccess.state === "operational_blocked") {
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

  if (
    workspaceAccess.state === "billing_blocked" &&
    !pathname.startsWith("/subscription")
  ) {
    const canOpenSubscription = clientNavVisibleForPermissions(
      "subscription",
      workspaceAccess.workspace.permissions,
    );

    return (
      <AppShell workspace={workspaceAccess.workspace} workspaces={workspaces}>
        <section className="page-stack">
          <header className="page-header">
            <div>
              <span className="eyebrow">Assinatura</span>
              <h1>Acesso suspenso</h1>
              <p>
                {canOpenSubscription
                  ? "Regularize a assinatura para voltar a acessar os dados e as operacoes deste workspace."
                  : "A assinatura deste workspace precisa ser regularizada pelo responsavel da conta."}
              </p>
            </div>
            <div className="header-actions">
              <span className="status-chip warn">pagamento pendente</span>
              {canOpenSubscription ? (
                <Link className="button primary" href="/subscription">
                  Gerenciar assinatura
                </Link>
              ) : null}
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

  // Fail-closed management routes: analyst (member) and others without the
  // matching permission cannot open integrations/settings/subscription by URL.
  const gatedNavId = managementNavIdForPath(pathname);
  if (
    gatedNavId &&
    !clientNavVisibleForPermissions(
      gatedNavId,
      workspaceAccess.workspace.permissions,
    )
  ) {
    redirect("/overview");
  }

  const dataSource = await getWhatsappDataSource();

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

function managementNavIdForPath(pathname: string): ClientNavId | null {
  if (pathname === "/integrations" || pathname.startsWith("/integrations/")) {
    return "integrations";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  if (pathname === "/subscription" || pathname.startsWith("/subscription/")) {
    return "subscription";
  }
  return null;
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
  | {
      state: "operational_blocked";
      workspace: CurrentWorkspaceDto | null;
    }
  | { state: "billing_blocked"; workspace: CurrentWorkspaceDto }
> {
  try {
    const workspace = await getCurrentWorkspace();

    if (workspace.accessMode !== "platform_support") {
      try {
        const packageAccess = await getWorkspacePackageAccess();

        if (packageAccess.enforcementEnabled && !packageAccess.allowed) {
          return {
            state: "billing_blocked",
            workspace,
          };
        }
      } catch {
        // The API guard remains authoritative if the lightweight UI check fails.
      }
    }

    return {
      state:
        workspace.operationalStatus === "blocked"
          ? "operational_blocked"
          : "active",
      workspace,
    };
  } catch (error) {
    const blocked =
      isApiRequestError(error) &&
      error.status === 403 &&
      error.message.toLowerCase().includes("workspace bloqueado");

    return {
      state: blocked ? "operational_blocked" : "active",
      workspace: null,
    };
  }
}

async function getRequestPathname(): Promise<string> {
  try {
    const requestHeaders = await headers();
    return requestHeaders.get("x-wpptrack-pathname") ?? "/overview";
  } catch {
    return "/overview";
  }
}
