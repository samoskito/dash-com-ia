"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDateTime } from "../../lib/date-time";
import {
  confirmClaimCode,
  requestClaimCode,
  type ClaimConfirmResult,
  type ClaimRequestResult,
} from "../../lib/license-claim-api";

const RESEND_COOLDOWN_MS = 60_000;
const IN_PROGRESS_RETRY_DELAY_MS = 2_000;
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type IssuedLicense = Extract<ClaimConfirmResult, { status: "issued" }>;
type ClaimErrorCode =
  | Extract<ClaimRequestResult, { ok: false }>["code"]
  | Extract<ClaimConfirmResult, { ok: false }>["code"];

type Step =
  | { name: "email" }
  | { name: "code" }
  | { name: "revealed"; license: IssuedLicense }
  | { name: "support" };

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

const errorMessages: Record<ClaimErrorCode, string> = {
  code_invalid: "Código inválido ou expirado.",
  in_progress:
    "A emissão da sua licença está em andamento. Aguarde um minuto e peça um novo código para ver a chave.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos.",
  disabled:
    "O resgate de licença está indisponível no momento. Tente novamente mais tarde.",
  network:
    "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.",
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function mount() {
      const turnstile = (window as { turnstile?: TurnstileApi }).turnstile;
      if (!turnstile || !containerRef.current) {
        timer = setTimeout(mount, 250);
        return;
      }
      widgetId = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    }

    mount();
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      const turnstile = (window as { turnstile?: TurnstileApi }).turnstile;
      if (widgetId && turnstile) {
        turnstile.remove(widgetId);
      }
    };
  }, [siteKey]);

  return (
    <>
      <script src={TURNSTILE_SCRIPT_URL} async defer />
      <div ref={containerRef} className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}

function EnvLine({ name, value }: { name: string; value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const line = `${name}=${value}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{line}</code>
      <button
        type="button"
        className="secondary-button"
        aria-label={`Copiar ${name}`}
        onClick={copy}
      >
        {copyState === "copied" ? "Copiado" : "Copiar"}
      </button>
      {copyState === "failed" ? (
        <p className="form-error">Não foi possível copiar. Selecione o texto e copie manualmente.</p>
      ) : null}
    </div>
  );
}

export function LicenseClaimForm({
  turnstileSiteKey,
  supportEmail,
  repoUrl,
  inProgressRetryDelayMs = IN_PROGRESS_RETRY_DELAY_MS,
}: {
  turnstileSiteKey?: string;
  supportEmail?: string;
  repoUrl?: string;
  inProgressRetryDelayMs?: number;
}) {
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are single-use: bumping the key remounts a fresh widget.
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const resendSecondsLeft =
    resendAvailableAt === null
      ? 0
      : Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (resendAvailableAt === null || resendAvailableAt <= Date.now()) {
      return;
    }
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAvailableAt) {
        clearInterval(interval);
      }
    }, 1_000);
    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaNonce((value) => value + 1);
  }

  async function sendCode(targetEmail: string): Promise<boolean> {
    if (turnstileSiteKey && !captchaToken) {
      setError("Conclua a verificação de segurança.");
      return false;
    }

    setLoading(true);
    const result = await requestClaimCode(targetEmail, captchaToken ?? undefined);
    setLoading(false);
    if (turnstileSiteKey) {
      resetCaptcha();
    }

    if (!result.ok) {
      setError(errorMessages[result.code]);
      return false;
    }

    const sentAt = Date.now();
    setNow(sentAt);
    setResendAvailableAt(sentAt + RESEND_COOLDOWN_MS);
    return true;
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
      setError("Informe um email válido.");
      return;
    }

    if (await sendCode(normalized)) {
      setSubmittedEmail(normalized);
      setCode("");
      setStep({ name: "code" });
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    if (await sendCode(submittedEmail)) {
      setNotice("Se o email for elegível, enviamos um novo código.");
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!/^\d{6}$/.test(code)) {
      setError("Digite os 6 dígitos do código.");
      return;
    }

    setLoading(true);
    let result = await confirmClaimCode(submittedEmail, code);
    if (!result.ok && result.code === "in_progress") {
      await wait(inProgressRetryDelayMs);
      const retry = await confirmClaimCode(submittedEmail, code);
      // The API consumes the code before issuing, so a retry that comes back
      // "invalid" still means the first attempt is being processed.
      result =
        !retry.ok && retry.code === "code_invalid"
          ? { ok: false, code: "in_progress" }
          : retry;
    }
    setLoading(false);

    if (!result.ok) {
      setError(errorMessages[result.code]);
      return;
    }

    setCode("");
    if (result.status === "issued") {
      setStep({ name: "revealed", license: result });
    } else {
      setStep({ name: "support" });
    }
  }

  function handleChangeEmail() {
    setError(null);
    setNotice(null);
    setCode("");
    setStep({ name: "email" });
  }

  const captcha = turnstileSiteKey ? (
    <TurnstileWidget
      key={captchaNonce}
      siteKey={turnstileSiteKey}
      onToken={setCaptchaToken}
    />
  ) : null;

  if (step.name === "revealed") {
    const { license } = step;
    return (
      <div className="login-form" aria-live="polite">
        <p className="eyebrow">Licença liberada</p>
        <p>
          Esta chave aparece só agora. Uma cópia também foi enviada para seu email quando a
          licença foi emitida. Não compartilhe.
        </p>
        <EnvLine name="LICENSE_KEY" value={license.licenseKey} />
        <EnvLine name="LICENSE_ACCOUNT_IDENTITY" value={license.accountIdentity} />
        <p>Válida até {formatDateTime(license.expiresAt, { dateStyle: "long" })}.</p>
        <ol>
          <li>
            Cole as duas linhas nas variáveis de ambiente da sua instalação do RastrackDash
            (painel do Dokploy ou arquivo <code>.env</code>).
          </li>
          <li>Salve e reinicie a aplicação.</li>
          <li>O RastrackDash ativa a licença automaticamente ao iniciar.</li>
        </ol>
        {repoUrl ? (
          <p>
            Ainda não instalou? Veja o passo a passo em{" "}
            <a href={repoUrl} target="_blank" rel="noreferrer">
              {repoUrl}
            </a>
            .
          </p>
        ) : null}
      </div>
    );
  }

  if (step.name === "support") {
    return (
      <div className="login-form" aria-live="polite">
        <p>
          Você já tem uma licença emitida.{" "}
          {supportEmail ? (
            <>
              Fale com o suporte: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </>
          ) : (
            "Fale com o suporte da PalmUP."
          )}
        </p>
      </div>
    );
  }

  if (step.name === "code") {
    return (
      <form className="login-form" onSubmit={handleCodeSubmit} noValidate>
        <p>
          Se o email for elegível, enviamos um código de 6 dígitos para{" "}
          <strong>{submittedEmail}</strong>. Verifique também o spam.
        </p>
        <label>
          Código
          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
        </label>
        {captcha}
        {notice ? (
          <p className="form-success" aria-live="polite">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? "Confirmando..." : "Confirmar"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={handleResend}
          disabled={loading || resendSecondsLeft > 0}
        >
          {resendSecondsLeft > 0
            ? `Reenviar código (${resendSecondsLeft}s)`
            : "Reenviar código"}
        </button>
        <button type="button" className="link-button" onClick={handleChangeEmail}>
          Trocar email
        </button>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handleEmailSubmit} noValidate>
      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {captcha}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={loading}>
        {loading ? "Enviando..." : "Enviar código"}
      </button>
    </form>
  );
}
