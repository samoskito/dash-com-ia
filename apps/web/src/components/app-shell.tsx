import { clientNavigation } from "@wpptrack/shared";
import type { CurrentWorkspaceDto } from "@wpptrack/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

export function AppShell({
  children,
  workspace
}: {
  children: ReactNode;
  workspace?: CurrentWorkspaceDto | null;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/overview" aria-label="WppTrack overview">
          <span className="brand-mark">W</span>
          <span className="brand-copy">
            <strong>WppTrack</strong>
            <span>Telemetry OS</span>
          </span>
        </Link>

        <section className="workspace-strip" aria-label="Workspace atual">
          <span>Workspace</span>
          <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
          <small>
            {workspace
              ? `${workspace.slug} · ${workspace.role}`
              : "Sessao autenticada"}
          </small>
        </section>

        <nav className="sidebar-nav" aria-label="Navegacao principal">
          <p className="nav-label">Operacao</p>
          {clientNavigation.map((item) => (
            <Link key={item.id} href={`/${item.id}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <section className="health-panel" aria-label="Conta">
          <p className="nav-label">Conta</p>
          {workspace ? (
            <span
              className={`status-chip${
                workspace.operationalStatus === "blocked" ? " warn" : ""
              }`}
            >
              {workspace.operationalStatus === "blocked" ? "bloqueado" : "ativo"}
            </span>
          ) : null}
          <LogoutButton />
        </section>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
