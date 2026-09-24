"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  Mail,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import { formatDateTime } from "../../lib/date-time";
import {
  confirmClaimCode,
  requestClaimCode,
  type ClaimConfirmResult,
  type ClaimRequestResult,
} from "../../lib/license-claim-api";

const RESEND_COOLDOWN_MS = 60_000;
const IN_PROGRESS_RETRY_DELAY_MS = 2_000;
const COPY_FEEDBACK_MS = 2_000;
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

const stepAnnouncements: Record<Step["name"], string> = {
  email: "Etapa 1 de 3: informe o email da compra.",
  code: "Etapa 2 de 3: digite o código enviado por email.",
  revealed: "Etapa 3 de 3: sua licença está pronta.",
  support: "Licença já emitida. Fale com o suporte.",
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
      <div ref={containerRef} className="cf-turnstile licenca-captcha" data-sitekey={siteKey} />
    </>
  );
}

function useCopy(text: string) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state !== "copied") {
      return;
    }
    const timer = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return { state, copy };
}

function CopyButton({
  label,
  idleText,
  state,
  onCopy,
}: {
  label: string;
  idleText: string;
  state: "idle" | "copied" | "failed";
  onCopy: () => void;
}) {
  const copied = state === "copied";
  return (
    <button
      type="button"
      className="licenca-copy"
      data-copied={copied ? "true" : undefined}
      aria-label={label}
      onClick={onCopy}
    >
      {copied ? (
        <Check aria-hidden="true" size={14} strokeWidth={2.25} />
      ) : (
        <Copy aria-hidden="true" size={14} strokeWidth={2} />
      )}
      <span>{copied ? "Copiado" : idleText}</span>
    </button>
  );
}

function EnvLine({ label, name, value }: { label: string; name: string; value: string }) {
  const line = `${name}=${value}`;
  const { state, copy } = useCopy(line);

  return (
    <div className="licenca-env">
      <div className="licenca-env-head">
        <span className="licenca-env-label">{label}</span>
        <CopyButton label={`Copiar ${name}`} idleText="Copiar" state={state} onCopy={copy} />
      </div>
      {/* Break after "=" first so name and value each stay on one line. */}
      <code className="licenca-env-value">
        {name}=<wbr />
        {value}
      </code>
      {state === "failed" ? (
        <p className="licenca-env-failed">
          Não foi possível copiar. Selecione o texto e copie manualmente.
        </p>
      ) : null}
    </div>
  );
}

function CopyAllButton({ text }: { text: string }) {
  const { state, copy } = useCopy(text);
  return (
    <CopyButton
      label="Copiar as duas linhas"
      idleText="Copiar as duas"
      state={state}
      onCopy={copy}
    />
  );
}

function Alert({ tone, id, children }: { tone: "error" | "success"; id?: string; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      id={id}
      className="licenca-alert"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={2} />
      {children}
    </p>
  );
}

const claimSteps = ["Email", "Código", "Chave"] as const;

function ClaimProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="licenca-steps" aria-label={`Etapa ${current} de ${claimSteps.length}`}>
      {claimSteps.map((label, index) => {
        const position = index + 1;
        const state = position < current ? "done" : position === current ? "current" : "todo";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="licenca-step-dot" aria-hidden="true">
              {state === "done" ? <Check size={11} strokeWidth={3} /> : position}
            </span>
            <span className="licenca-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
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
  // Only input-validation errors mark the field invalid; server errors do not.
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are single-use: bumping the key remounts a fresh widget.
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const previousStep = useRef<Step["name"]>(step.name);

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

  // Move focus with the step so keyboard and screen-reader users land on the
  // new content. The code step focuses its input via autoFocus instead.
  useEffect(() => {
    if (previousStep.current === step.name) {
      return;
    }
    previousStep.current = step.name;
    if (step.name === "email") {
      emailInputRef.current?.focus();
    } else if (step.name !== "code") {
      headingRef.current?.focus();
    }
  }, [step.name]);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaNonce((value) => value + 1);
  }

  function clearMessages() {
    setError(null);
    setFieldInvalid(false);
    setNotice(null);
  }

  function showFieldError(message: string) {
    setError(message);
    setFieldInvalid(true);
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
    clearMessages();

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
      showFieldError("Informe um email válido.");
      return;
    }

    if (await sendCode(normalized)) {
      setSubmittedEmail(normalized);
      setCode("");
      setStep({ name: "code" });
    }
  }

  async function handleResend() {
    clearMessages();
    if (await sendCode(submittedEmail)) {
      setNotice("Se o email for elegível, enviamos um novo código.");
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (!/^\d{6}$/.test(code)) {
      showFieldError("Digite os 6 dígitos do código.");
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
      if (result.code === "code_invalid") {
        showFieldError(errorMessages[result.code]);
      } else {
        setError(errorMessages[result.code]);
      }
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
    clearMessages();
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

  const errorId = "licenca-error";
  const errorAlert = error ? (
    <Alert tone="error" id={errorId}>
      {error}
    </Alert>
  ) : null;

  function heading(text: string) {
    return (
      <h1 id="license-claim-title" ref={headingRef} tabIndex={-1} className="licenca-title">
        {text}
      </h1>
    );
  }

  function submitButton(idle: string, pending: string) {
    return (
      <button
        type="submit"
        className="licenca-primary"
        disabled={loading}
        data-pending={loading ? "true" : undefined}
      >
        {loading ? pending : idle}
      </button>
    );
  }

  let body: ReactNode;

  if (step.name === "revealed") {
    const { license } = step;
    const keyLine = `LICENSE_KEY=${license.licenseKey}`;
    const identityLine = `LICENSE_ACCOUNT_IDENTITY=${license.accountIdentity}`;
    body = (
      <div key="revealed" className="licenca-body">
        <ClaimProgress current={3} />
        <div className="licenca-intro">
          {heading("Sua licença está pronta")}
          <p className="licenca-lead">
            Adicione as duas variáveis abaixo à sua instalação do RastrackDash.
          </p>
        </div>
        <p className="licenca-callout">
          <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />
          <span>
            Esta chave aparece só agora. Uma cópia também foi enviada para seu email quando a
            licença foi emitida. Não compartilhe.
          </span>
        </p>
        <section className="licenca-envs" aria-labelledby="licenca-envs-title">
          <div className="licenca-envs-head">
            <h2 id="licenca-envs-title" className="licenca-subtitle">
              Variáveis de ambiente
            </h2>
            <CopyAllButton text={`${keyLine}\n${identityLine}`} />
          </div>
          <EnvLine label="Chave de licença" name="LICENSE_KEY" value={license.licenseKey} />
          <EnvLine
            label="Identidade da conta"
            name="LICENSE_ACCOUNT_IDENTITY"
            value={license.accountIdentity}
          />
          <p className="licenca-meta">
            Válida até {formatDateTime(license.expiresAt, { dateStyle: "long" })}.
          </p>
        </section>
        <section className="licenca-howto" aria-labelledby="licenca-howto-title">
          <h2 id="licenca-howto-title" className="licenca-subtitle">
            Como ativar
          </h2>
          <ol className="licenca-howto-list">
            <li>
              Cole as duas linhas nas variáveis de ambiente da sua instalação do RastrackDash
              (painel do Dokploy ou arquivo <code>.env</code>).
            </li>
            <li>Salve e reinicie a aplicação.</li>
            <li>O RastrackDash ativa a licença automaticamente ao iniciar.</li>
          </ol>
        </section>
        {repoUrl ? (
          <p className="licenca-meta licenca-install">
            Ainda não instalou?{" "}
            <a className="licenca-link" href={repoUrl} target="_blank" rel="noreferrer">
              Veja o passo a passo de instalação
              <ArrowUpRight aria-hidden="true" size={14} strokeWidth={2} />
            </a>
          </p>
        ) : null}
      </div>
    );
  } else if (step.name === "support") {
    body = (
      <div key="support" className="licenca-body">
        <div className="licenca-intro">
          {heading("Licença já emitida")}
          <p className="licenca-lead">
            Você já tem uma licença emitida para este email. Para recuperar a chave, fale com o
            suporte{supportEmail ? "." : " da PalmUP."}
          </p>
        </div>
        {supportEmail ? (
          <a className="licenca-support" href={`mailto:${supportEmail}`}>
            <Mail aria-hidden="true" size={18} strokeWidth={1.75} />
            <span className="licenca-support-text">
              <span className="licenca-support-label">Suporte PalmUP</span>
              <span className="licenca-support-email">{supportEmail}</span>
            </span>
            <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
          </a>
        ) : null}
        <button type="button" className="licenca-text-button" onClick={handleChangeEmail}>
          Usar outro email
        </button>
      </div>
    );
  } else if (step.name === "code") {
    body = (
      <form key="code" className="licenca-body" onSubmit={handleCodeSubmit} noValidate>
        <ClaimProgress current={2} />
        <div className="licenca-intro">
          {heading("Confira seu email")}
          <p className="licenca-lead">
            Se o email for elegível, enviamos um código de 6 dígitos para{" "}
            <strong>{submittedEmail}</strong>. Verifique também o spam.
          </p>
        </div>
        <div className="licenca-field">
          <label htmlFor="licenca-code">Código</label>
          <input
            id="licenca-code"
            className="licenca-input licenca-code-input"
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            aria-invalid={fieldInvalid || undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
        </div>
        {captcha}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {errorAlert}
        {submitButton("Confirmar", "Confirmando...")}
        <div className="licenca-secondary">
          <button
            type="button"
            className="licenca-text-button"
            onClick={handleResend}
            disabled={loading || resendSecondsLeft > 0}
          >
            <RotateCw aria-hidden="true" size={14} strokeWidth={2} />
            {resendSecondsLeft > 0
              ? `Reenviar código (${resendSecondsLeft}s)`
              : "Reenviar código"}
          </button>
          <button type="button" className="licenca-text-button" onClick={handleChangeEmail}>
            Trocar email
          </button>
        </div>
      </form>
    );
  } else {
    body = (
      <form key="email" className="licenca-body" onSubmit={handleEmailSubmit} noValidate>
        <ClaimProgress current={1} />
        <div className="licenca-intro">
          {heading("Resgatar licença RastrackDash")}
          <p className="licenca-lead">
            Use o email da sua compra na PalmUP. Enviamos um código de verificação para ele e,
            depois de confirmar, sua chave aparece aqui.
          </p>
        </div>
        <div className="licenca-field">
          <label htmlFor="licenca-email">Email</label>
          <input
            ref={emailInputRef}
            id="licenca-email"
            className="licenca-input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            aria-invalid={fieldInvalid || undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {captcha}
        {errorAlert}
        {submitButton("Enviar código", "Enviando...")}
      </form>
    );
  }

  return (
    <div className="licenca-shell" data-step={step.name}>
      <p className="licenca-sr-only" aria-live="polite">
        {stepAnnouncements[step.name]}
      </p>
      <section className="licenca-card" aria-labelledby="license-claim-title">
        {body}
      </section>
      {supportEmail && step.name !== "support" ? (
        <p className="licenca-footnote">
          Precisa de ajuda?{" "}
          <a className="licenca-link" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
        </p>
      ) : null}
    </div>
  );
}
