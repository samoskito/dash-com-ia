"use client";

import { clientNavigation } from "@wpptrack/shared";
import type {
  CurrentWorkspaceDto,
  WhatsappDataSourceDto,
} from "@wpptrack/shared";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LogoutButton } from "./logout-button";
import { DataAutoRefresh } from "./data-auto-refresh";
import { exitPlatformSupportAccess } from "../app/actions/platform-support";

const sidebarStorageKey = "wpptrack-sidebar-collapsed";

function workspaceAccessLabel(workspace: CurrentWorkspaceDto): string {
  if (workspace.accessMode === "platform_support") {
    return "acesso de suporte";
  }

  if (workspace.role === "owner") {
    return "responsavel da conta";
  }

  return workspace.role === "admin" ? "administrador" : "analista";
}

export function AppShell({
  children,
  dataSource,
  workspace,
}: {
  children: ReactNode;
  dataSource?: WhatsappDataSourceDto | null;
  workspace?: CurrentWorkspaceDto | null;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(
      window.localStorage.getItem(sidebarStorageKey) === "true",
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateViewport = () => {
      setIsMobile(mediaQuery.matches);

      if (!mediaQuery.matches) {
        setMobileMenuOpen(false);
      }
    };

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobile || !mobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobile, mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileMenuOpen ? " mobile-menu-open" : ""}`}
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
    >
      <header className="mobile-shell-header">
        <Link
          className="brand"
          href="/overview"
          aria-label="WppTrack - ir para a Visao geral"
          onClick={closeMobileMenu}
        >
          <span className="brand-mark">W</span>
          <span className="brand-copy">
            <strong>WppTrack</strong>
          </span>
        </Link>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          aria-controls="app-sidebar"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          {mobileMenuOpen ? (
            <X aria-hidden="true" size={20} strokeWidth={2.2} />
          ) : (
            <Menu aria-hidden="true" size={20} strokeWidth={2.2} />
          )}
        </button>
      </header>

      <aside
        id="app-sidebar"
        className="sidebar"
        aria-hidden={isMobile && !mobileMenuOpen}
        inert={isMobile && !mobileMenuOpen}
      >
        <div className="sidebar-topline">
          <Link
            className="brand"
            href="/overview"
            aria-label="WppTrack - ir para a Visao geral"
            onClick={closeMobileMenu}
          >
            <span className="brand-mark">W</span>
            <span className="brand-copy">
              <strong>WppTrack</strong>
            </span>
          </Link>
          <button
            className="sidebar-toggle desktop-sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((current) => !current)}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={18} strokeWidth={2.2} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={18} strokeWidth={2.2} />
            )}
            <span className="sidebar-toggle-label">
              {sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            </span>
          </button>
          <button
            className="sidebar-toggle mobile-sidebar-close"
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
          >
            <X aria-hidden="true" size={20} strokeWidth={2.2} />
          </button>
        </div>

        <section className="workspace-strip" aria-label="Workspace atual">
          <span>Workspace</span>
          <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
          <small>
            {workspace
              ? `${workspace.slug} - ${workspaceAccessLabel(workspace)}`
              : "Sessao autenticada"}
          </small>
        </section>

        <nav className="sidebar-nav" aria-label="Navegacao principal">
          <p className="nav-label">Operacao</p>
          {clientNavigation.map((item) => (
            <Link
              key={item.id}
              href={`/${item.id}`}
              title={item.label}
              onClick={closeMobileMenu}
            >
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
            <Link
              href="/backoffice/clients"
              title="Backoffice"
              onClick={closeMobileMenu}
            >
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
      <button
        className="mobile-sidebar-backdrop"
        type="button"
        aria-label="Fechar menu"
        tabIndex={mobileMenuOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />
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
        {workspace ? <DataAutoRefresh source={dataSource ?? null} /> : null}
        {children}
      </main>
    </div>
  );
}
