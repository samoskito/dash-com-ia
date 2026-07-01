import { clientNavigation } from "@wpptrack/shared";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/overview" aria-label="WppTrack overview">
          <span className="brand-mark">W</span>
          <strong>WppTrack</strong>
        </Link>
        <nav className="sidebar-nav" aria-label="Navegacao principal">
          {clientNavigation.map((item) => (
            <Link key={item.id} href={`/${item.id}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
