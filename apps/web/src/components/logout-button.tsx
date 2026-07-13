"use client";

import { LogOut } from "lucide-react";
import { apiFetch } from "../lib/api";

export function LogoutButton() {
  async function logout() {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      className="logout-button"
      type="button"
      aria-label="Sair da conta"
      title="Sair da conta"
      onClick={logout}
    >
      <LogOut className="logout-icon" aria-hidden="true" size={16} />
      <span className="logout-label">Sair</span>
    </button>
  );
}
