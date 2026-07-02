"use client";

import { apiFetch } from "../lib/api";

export function LogoutButton() {
  async function logout() {
    try {
      await apiFetch("/auth/logout", {
        method: "POST"
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button className="logout-button" type="button" onClick={logout}>
      Sair
    </button>
  );
}
