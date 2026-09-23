import { LicenseClaimForm } from "./license-claim-form";

const STUDENT_TEMPLATE_REPO_URL = "https://github.com/samoskito/nod-rastrackdash-wpp";

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function LicenseClaimPage() {
  const turnstileSiteKey = optionalEnv(
    process.env.NEXT_PUBLIC_LICENSE_CLAIM_TURNSTILE_SITE_KEY,
  );
  const supportEmail = optionalEnv(process.env.NEXT_PUBLIC_LICENSE_CLAIM_SUPPORT_EMAIL);

  return (
    <main className="standalone-page login-page">
      <section className="login-panel" aria-labelledby="license-claim-title">
        <div>
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <p className="eyebrow">Alunos PalmUP</p>
          <h1 id="license-claim-title">Resgatar licença RastrackDash</h1>
          <p>Use o email da sua compra na PalmUP.</p>
          <p>
            Enviamos um código de verificação para esse email. Depois de confirmar o código, a
            sua chave de licença aparece nesta página.
          </p>
        </div>

        <LicenseClaimForm
          turnstileSiteKey={turnstileSiteKey}
          supportEmail={supportEmail}
          repoUrl={STUDENT_TEMPLATE_REPO_URL}
        />
      </section>
    </main>
  );
}
