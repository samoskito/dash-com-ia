export default function LoginPage() {
  return (
    <main className="standalone-page login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <p className="eyebrow">Acesso seguro</p>
          <h1 id="login-title">Entrar no WppTrack</h1>
          <p>
            Acesse o painel para acompanhar leads, relatorios, integracoes e
            diagnosticos da sua operacao.
          </p>
        </div>

        <form className="login-form">
          <label>
            Email
            <input type="email" name="email" autoComplete="email" />
          </label>
          <label>
            Senha
            <input type="password" name="password" autoComplete="current-password" />
          </label>
          <button type="submit">Entrar</button>
          <button type="button" className="secondary-button">
            Continuar com Google
          </button>
          <a href="/login">Esqueci minha senha</a>
        </form>
      </section>
    </main>
  );
}
