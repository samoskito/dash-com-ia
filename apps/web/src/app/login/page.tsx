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

          <div className="login-status-grid" aria-label="Cobertura da plataforma">
            <div className="quality-card">
              <span className="micro-label">Leads rastreados</span>
              <strong>Atribuicao por origem</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">Campanhas Meta</span>
              <strong>Funil por campanha</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">Eventos Pixel</span>
              <strong>Envio server-side</strong>
            </div>
            <div className="quality-card">
              <span className="micro-label">Diagnostico</span>
              <strong>Logs auditaveis</strong>
            </div>
          </div>
        </div>

        <LoginForm initialError={initialError} />
      </section>
    </main>
  );
}
