import { LoginForm } from "./login-form";

type LoginSearchParams = Record<string, string | string[] | undefined>;

function asStringParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function loginErrorMessage(error: string | undefined): string | null {
  if (!error) {
    return null;
  }

  if (error === "google_env") {
    return "Login com Google ainda nao esta configurado.";
  }

  if (error === "google_exchange" || error === "google_pending") {
    return "Nao foi possivel concluir o login com Google.";
  }

  return "Nao foi possivel autenticar. Tente novamente.";
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<LoginSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialError = loginErrorMessage(asStringParam(resolvedSearchParams.error));

  return (
    <main className="standalone-page login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <p className="eyebrow">Telemetria de conversoes</p>
          <h1 id="login-title">Entrar no WppTrack</h1>
          <p>
            Acesse o painel para acompanhar leads, campanhas, eventos Pixel e diagnosticos da sua
            operacao em uma unica tela de controle.
          </p>

          <div className="login-status-grid" aria-label="Status da plataforma">
            <div className="quality-card">
              <span className="micro-label">Status da plataforma</span>
              <strong>API online</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">Meta CAPI</span>
              <strong>99.2% aceito</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">WhatsApp</span>
              <strong>Fila estavel</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">Pixel</span>
              <strong>Sinal ativo</strong>
            </div>
          </div>
        </div>

        <LoginForm initialError={initialError} />
      </section>
    </main>
  );
}
