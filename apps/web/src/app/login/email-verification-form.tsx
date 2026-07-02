"use client";

import { useState, type FormEvent } from "react";
import {
  emailVerificationConfirmInputSchema,
  type EmailVerificationConfirmDto
} from "@wpptrack/shared";
import { apiFetch } from "../../lib/api";

export function EmailVerificationConfirmForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = emailVerificationConfirmInputSchema.parse({
      token: form.get("token")
    });

    try {
      await apiFetch<EmailVerificationConfirmDto>(
        "/auth/email/verification/confirm",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
      setMessage("Email confirmado. Voce ja pode voltar para o painel.");
    } catch {
      setError("Nao foi possivel confirmar este email com o token informado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <input type="hidden" name="token" value={token} />
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Validando..." : "Validar verificacao"}
      </button>
      <a href="/settings">Voltar para configuracoes</a>
    </form>
  );
}
