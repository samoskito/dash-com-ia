import {
  Activity,
  ArrowRight,
  UsersRound,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BackofficeNavigation } from "./backoffice-navigation";

const destinations: Array<{
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  meta: string;
}> = [
  {
    description:
      "Encontre rapidamente os eventos Umbler, identifique CTWA e abra o payload auditado.",
    href: "/backoffice/inbound-webhooks",
    icon: Webhook,
    label: "Webhooks WhatsApp",
    meta: "Observacao Umbler",
  },
  {
    description:
      "Crie workspaces, gerencie responsaveis e acompanhe conectores dos clientes.",
    href: "/backoffice/clients",
    icon: UsersRound,
    label: "Clientes e acessos",
    meta: "Contas da plataforma",
  },
  {
    description:
      "Consulte cobrancas, instancias, jobs, chamadas externas, CAPI e auditorias.",
    href: "/backoffice?view=operations",
    icon: Activity,
    label: "Operacoes internas",
    meta: "Uso tecnico",
  },
];

export function BackofficeHome() {
  return (
    <section className="page-stack standalone-page backoffice-home">
      <BackofficeNavigation active="home" />

      <header className="page-header">
        <div>
          <span className="eyebrow">Operacao da plataforma</span>
          <h1>Central do backoffice</h1>
          <p>Escolha uma area para trabalhar sem misturar dados e filtros.</p>
        </div>
        <span className="status-chip">
          <Wrench aria-hidden="true" size={14} strokeWidth={2} />
          Platform owner
        </span>
      </header>

      <section className="backoffice-command-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Areas de trabalho</span>
            <h2>O que voce precisa fazer?</h2>
          </div>
        </div>

        <div className="backoffice-command-list">
          {destinations.map((destination) => {
            const Icon = destination.icon;

            return (
              <a
                className="backoffice-command-row"
                href={destination.href}
                key={destination.href}
              >
                <span className="backoffice-command-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span className="backoffice-command-copy">
                  <span className="micro-label">{destination.meta}</span>
                  <strong>{destination.label}</strong>
                  <span>{destination.description}</span>
                </span>
                <ArrowRight
                  className="backoffice-command-arrow"
                  aria-hidden="true"
                  size={19}
                  strokeWidth={2}
                />
              </a>
            );
          })}
        </div>
      </section>
    </section>
  );
}
