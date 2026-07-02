import { LoginForm } from "./login-form";

export default function LoginPage() {
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

        <LoginForm />
      </section>
    </main>
  );
}
