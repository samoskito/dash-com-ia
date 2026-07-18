import {
  Home,
  Settings2,
  UsersRound,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type BackofficeArea =
  | "clients"
  | "home"
  | "operations"
  | "webhooks";

type BackofficeNavigationProps = {
  active: BackofficeArea;
};

const items: Array<{
  area: BackofficeArea;
  href: string;
  icon: LucideIcon;
  label: string;
}> = [
  {
    area: "home",
    href: "/backoffice",
    icon: Home,
    label: "Inicio",
  },
  {
    area: "clients",
    href: "/backoffice/clients",
    icon: UsersRound,
    label: "Clientes",
  },
  {
    area: "webhooks",
    href: "/backoffice/inbound-webhooks",
    icon: Webhook,
    label: "Webhooks WhatsApp",
  },
  {
    area: "operations",
    href: "/backoffice?view=operations",
    icon: Settings2,
    label: "Operacoes internas",
  },
];

export function BackofficeNavigation({
  active,
}: BackofficeNavigationProps) {
  return (
    <nav className="backoffice-navigation" aria-label="Areas do backoffice">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.area === active;

        return (
          <a
            className={`backoffice-navigation-link${isActive ? " active" : ""}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            key={item.area}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={2} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
