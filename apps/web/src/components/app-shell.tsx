"use client";

import { clientNavigation } from "@wpptrack/shared";
import type { CurrentWorkspaceDto } from "@wpptrack/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LogoutButton } from "./logout-button";
import { exitPlatformSupportAccess } from "../app/actions/platform-support";

const sidebarStorageKey = "wpptrack-sidebar-collapsed";

export function AppShell({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace?: CurrentWorkspaceDto | null;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(
      window.localStorage.getItem(sidebarStorageKey) === "true",
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
    >
      <aside className="sidebar">
        <div className="sidebar-topline">
          <Link
            className="brand"
            href="/overview"
            aria-label="WppTrack overview"
          >
            <span className="brand-mark">W</span>
            <span className="brand-copy">
              <strong>WppTrack</strong>
              <span>Telemetry OS</span>
            </span>
          </Link>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((current) => !current)}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <span aria-hidden="true">{sidebarCollapsed ? ">" : "<"}</span>
            <span className="sidebar-toggle-label">
              {sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            </span>
          </button>
        </div>

        <section className="workspace-strip" aria-label="Workspace atual">
          <span>Workspace</span>
          <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
          <small>
            {workspace
              ? `${workspace.slug} - ${workspace.role}`
              : "Sessao autenticada"}
          </small>
        </section>

        <nav className="sidebar-nav" aria-label="Navegacao principal">
          <p className="nav-label">Operacao</p>
          {clientNavigation.map((item) => (
            <Link key={item.id} href={`/${item.id}`} title={item.label}>
              <span className="nav-short" aria-hidden="true">
                {item.label.slice(0, 1)}
              </span>
              <span className="nav-text">{item.label}</span>
            </Link>
          ))}
        </nav>

        {workspace?.platformRole ? (
          <nav
            className="sidebar-nav platform-sidebar-nav"
            aria-label="Administracao da plataforma"
          >
            <p className="nav-label">Plataforma</p>
            <Link href="/backoffice/clients" title="Backoffice">
              <span className="nav-short" aria-hidden="true">
                P
              </span>
              <span className="nav-text">Backoffice</span>
            </Link>
          </nav>
        ) : null}

        <section className="health-panel" aria-label="Conta">
          <p className="nav-label">Conta</p>
          {workspace ? (
            <span
              className={`status-chip${
                workspace.operationalStatus === "blocked" ? " warn" : ""
              }`}
            >
              {workspace.operationalStatus === "blocked"
                ? "bloqueado"
                : "ativo"}
            </span>
          ) : null}
          <LogoutButton />
        </section>
      </aside>
      <main className="content">
        {workspace?.accessMode === "platform_support" ? (
          <div className="support-context-bar" role="status">
            <div>
              <span>Acesso de suporte</span>
              <strong>{workspace.name}</strong>
            </div>
            <form action={exitPlatformSupportAccess}>
              <button className="button ghost" type="submit">
                Encerrar acesso
              </button>
            </form>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
