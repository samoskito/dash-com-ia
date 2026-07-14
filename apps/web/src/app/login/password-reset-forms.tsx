"use client";

import { useState, type FormEvent } from "react";
import {
  passwordResetConfirmInputSchema,
  passwordResetRequestInputSchema,
  type PasswordResetRequestDto,
} from "@wpptrack/shared";
import { apiFetch } from "../../lib/api";

export function PasswordResetRequestForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setDevToken(null);
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = passwordResetRequestInputSchema.parse({
      email: form.get("email"),
    });

    try {
      const result = await apiFetch<PasswordResetRequestDto>(
        "/auth/password/forgot",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      setMessage(
        "Se houver uma conta elegivel para este email, enviaremos as instrucoes de recuperacao.",
      );
      setDevToken(result.devToken);
    } catch {
      setError("Nao foi possivel solicitar a recuperacao agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        Email
        <input type="email" name="email" autoComplete="email" />
      </label>
      {message ? <p className="form-success">{message}</p> : null}
      {devToken ? (
        <p className="form-success">
          Token de desenvolvimento: <code>{devToken}</code>
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Enviando..." : "Enviar link de recuperacao"}
      </button>
      <a href="/login">Voltar para login</a>
    </form>
  );
}

export function PasswordResetConfirmForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = passwordResetConfirmInputSchema.parse({
      token: form.get("token"),
      password: form.get("password"),
    });

    try {
      await apiFetch("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage("Senha redefinida. Voce ja pode entrar novamente.");
    } catch {
      setError("Este link e invalido, expirou ou ja foi utilizado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <input type="hidden" name="token" value={token} />
      <label>
        Nova senha
        <input type="password" name="password" autoComplete="new-password" />
      </label>
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Redefinindo..." : "Redefinir senha"}
      </button>
      <a href="/login">Voltar para login</a>
    </form>
  );
}
