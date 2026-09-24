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
    <main className="standalone-page licenca-page">
      <header className="licenca-brand">
        <span className="licenca-brand-mark" aria-hidden="true">
          R
        </span>
        <span className="licenca-brand-name">RastrackDash</span>
        <span className="licenca-brand-divider" aria-hidden="true" />
        <span className="licenca-brand-owner">Alunos PalmUP</span>
      </header>

      <LicenseClaimForm
        turnstileSiteKey={turnstileSiteKey}
        supportEmail={supportEmail}
        repoUrl={STUDENT_TEMPLATE_REPO_URL}
      />
    </main>
  );
}
