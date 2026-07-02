"use client";

import { useState, type FormEvent } from "react";
import { loginSchema, registerSchema } from "@wpptrack/shared";
import { apiFetch } from "../../lib/api";

type Mode = "login" | "register";

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "login"
        ? loginSchema.parse({
            email: form.get("email"),
            password: form.get("password")
          })
        : registerSchema.parse({
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            workspaceName: form.get("workspaceName")
          });

    try {
      await apiFetch(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      window.location.href = "/overview";
    } catch {
      setError("Nao foi possivel autenticar. Confira os dados e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {mode === "register" ? (
        <>
          <label>
            Nome
            <input type="text" name="name" autoComplete="name" />
          </label>
          <label>
            Empresa
            <input type="text" name="workspaceName" autoComplete="organization" />
          </label>
        </>
      ) : null}
      <label>
        Email
        <input type="email" name="email" autoComplete="email" />
      </label>
      <label>
        Senha
        <input
          type="password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
      <a className="secondary-button" href="/login/google">
        Entrar com Google
      </a>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Criar conta" : "Ja tenho conta"}
      </button>
      {mode === "login" ? <a href="/login/forgot">Esqueci minha senha</a> : null}
    </form>
  );
}
