import { clientNavigation } from "@wpptrack/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

export function AppShell({ children }: { children: ReactNode }) {
  const health = [
    { label: "API", state: "ok", detail: "online" },
    { label: "Meta", state: "ok", detail: "v21" },
    { label: "WhatsApp", state: "warn", detail: "fila 02" },
    { label: "Pixel", state: "ok", detail: "ativo" }
  ];

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
          <strong>Operacao principal</strong>
          <small>1 conta Meta, 1 pixel, 3 usuarios</small>
        </section>

        <nav className="sidebar-nav" aria-label="Navegacao principal">
          <p className="nav-label">Operacao</p>
          {clientNavigation.map((item) => (
            <Link key={item.id} href={`/${item.id}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <section className="health-panel" aria-label="Saude das conexoes">
          <p className="nav-label">Health</p>
          {health.map((item) => (
            <span
              className={`status-chip${item.state === "warn" ? " warn" : ""}`}
              key={item.label}
              title={item.detail}
            >
              {item.label} {item.detail}
            </span>
          ))}
          <LogoutButton />
        </section>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
