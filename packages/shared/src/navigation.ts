export const clientNavigation = [
  { id: "overview", label: "Visao geral" },
  { id: "leads", label: "Leads" },
  { id: "reports", label: "Relatorios" },
  { id: "integrations", label: "Integracoes" },
  { id: "settings", label: "Configuracoes" }
] as const;

export const backofficeNavigation = [
  { id: "workspaces", label: "Workspaces" },
  { id: "billing", label: "Financeiro" },
  { id: "split", label: "Split" },
  { id: "diagnostics", label: "Diagnostico" }
] as const;

export type ClientNavId = (typeof clientNavigation)[number]["id"];
export type BackofficeNavId = (typeof backofficeNavigation)[number]["id"];
