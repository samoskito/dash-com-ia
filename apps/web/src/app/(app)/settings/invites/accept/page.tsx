import type { WorkspaceInviteAcceptDto } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { serverApiFetch } from "../../../../../lib/server-api";

type InviteAcceptSearchParams = {
  token?: string;
};

async function acceptWorkspaceInvite(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();

  if (!token) {
    return;
  }

  await serverApiFetch<WorkspaceInviteAcceptDto>("/workspaces/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token })
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export default async function WorkspaceInviteAcceptPage({
  searchParams
}: {
  searchParams?: Promise<InviteAcceptSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const token = String(resolvedSearchParams.token ?? "").trim();

  if (!token) {
    return (
      <section className="page-stack">
        <header className="page-header">
          <div>
            <span className="eyebrow">Convite de workspace</span>
            <h1>Convite invalido</h1>
            <p>O link recebido nao trouxe um token de convite valido.</p>
          </div>
          <div className="header-actions">
            <Link className="button primary" href="/settings">
              Voltar para configuracoes
            </Link>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Convite de workspace</span>
          <h1>Aceitar convite</h1>
          <p>
            Entre com o email convidado antes de aceitar. O convite so sera aplicado a conta
            autenticada com esse email.
          </p>
        </div>
      </header>

      <article className="surface-panel">
        <span className="micro-label">Workspace</span>
        <h2>Confirme sua entrada no workspace</h2>
        <p>
          Se voce estiver logado com outro usuario, saia e acesse novamente usando o email
          convidado antes de continuar.
        </p>
        <form className="header-actions" action={acceptWorkspaceInvite}>
          <input type="hidden" name="token" value={token} />
          <button className="button primary" type="submit">
            Aceitar convite
          </button>
          <Link className="button" href="/settings">
            Voltar
          </Link>
        </form>
      </article>
    </section>
  );
}
