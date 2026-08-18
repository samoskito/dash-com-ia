"use client";

import { ArrowLeftRight, TriangleAlert, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { ClientSwapActionResult } from "../app/(app)/settings/client-swap-actions";

const REDIRECT_DELAY_MS = 1600;

export function ClientSwapPanel({
  workspaceId,
  workspaceName,
  swapAction,
  successRedirect = "/login?swapped=1",
}: {
  workspaceId: string;
  workspaceName: string;
  swapAction: (
    workspaceId: string,
    currentWorkspaceName: string,
    confirmationName: string,
    newClientName: string,
  ) => Promise<ClientSwapActionResult>;
  successRedirect?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmationName, setConfirmationName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientSwapActionResult | null>(null);
  const confirmed =
    confirmationName.trim() === workspaceName.trim() && understood;
  const done = result?.ok === true;

  function resetForm() {
    setConfirmationName("");
    setNewClientName("");
    setUnderstood(false);
    setError(null);
    setResult(null);
  }

  function closeDialog() {
    if (pending) {
      return;
    }

    dialogRef.current?.close();
    resetForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!confirmed || pending || done) {
      return;
    }

    setPending(true);
    setError(null);

    const outcome = await swapAction(
      workspaceId,
      workspaceName,
      confirmationName,
      newClientName,
    );

    if (!outcome.ok) {
      setError(outcome.message);
      setPending(false);
      return;
    }

    setResult(outcome);
    window.setTimeout(() => {
      window.location.href = successRedirect;
    }, REDIRECT_DELAY_MS);
  }

  return (
    <>
      <div className="client-swap-trigger" data-presentation-sensitive-action="true">
        <button
          className="button danger"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
          Trocar de cliente...
        </button>
      </div>

      <dialog
        className="meta-action-dialog client-swap-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }

          closeDialog();
        }}
      >
        <div className="meta-action-dialog-header">
          <div>
            <span className="micro-label">Acao irreversivel</span>
            <h3>Trocar de cliente neste workspace?</h3>
          </div>
          <button
            className="meta-dialog-close"
            type="button"
            aria-label="Fechar confirmacao"
            title="Fechar"
            onClick={closeDialog}
            disabled={pending}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <form className="meta-action-form" onSubmit={handleSubmit}>
          <div className="meta-disconnect-warning">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>Os dados operacionais do cliente atual serao apagados</strong>
              <p>
                Leads, configuracoes e instancias do WhatsApp, integracoes com a
                Meta, conversoes, regras, catalogos, webhooks inbound,
                conectores externos e logs operacionais deste cliente serao
                removidos.
              </p>
            </div>
          </div>

          <dl className="client-swap-lists">
            <div>
              <dt>Apaga</dt>
              <dd>
                Leads, Meta, WhatsApp (configuracoes e instancias), conversoes,
                regras, catalogos, webhooks inbound, conectores externos e
                logs operacionais do cliente.
              </dd>
            </div>
            <div>
              <dt>Mantem</dt>
              <dd>
                Assinatura e cobranca da agencia, equipe (membros e convites),
                registro de auditoria e o workspace em si.
              </dd>
            </div>
          </dl>

          <label className="field-label" htmlFor="client-swap-current-name">
            Workspace atual
          </label>
          <input
            id="client-swap-current-name"
            readOnly
            value={workspaceName}
            data-presentation-sensitive-field="true"
          />

          <label className="field-label" htmlFor="client-swap-confirmation">
            Digite <strong>{workspaceName}</strong> para confirmar
          </label>
          <input
            id="client-swap-confirmation"
            autoComplete="off"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            disabled={pending || done}
            data-presentation-sensitive-field="true"
          />

          <label className="field-label" htmlFor="client-swap-new-name">
            Novo nome do cliente (opcional)
          </label>
          <input
            id="client-swap-new-name"
            autoComplete="off"
            maxLength={100}
            value={newClientName}
            onChange={(event) => setNewClientName(event.target.value)}
            disabled={pending || done}
            data-presentation-sensitive-field="true"
          />

          <label className="client-swap-checkbox">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              disabled={pending || done}
            />
            <span>
              Entendo que esta acao e irreversivel e apaga os dados do
              cliente atual
            </span>
          </label>

          {error ? (
            <div className="feedback-banner error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          {done ? (
            <div className="feedback-banner success" role="status">
              <strong>Dados do cliente anterior removidos.</strong>
              <span>
                {result?.ok && result.replayed
                  ? "Solicitacao ja tinha sido processada."
                  : "Redirecionando para o login..."}
              </span>
              {result?.ok ? (
                <details className="client-swap-details">
                  <summary>Ver contadores</summary>
                  <ul>
                    {Object.entries(result.wipedCounts).map(
                      ([key, count]) => (
                        <li key={key}>
                          {key}: {count}
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="meta-action-dialog-footer">
            <button
              className="button"
              type="button"
              onClick={closeDialog}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              type="submit"
              disabled={!confirmed || pending || done}
            >
              <ArrowLeftRight size={16} aria-hidden="true" />
              {pending ? "Trocando..." : "Trocar de cliente"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
