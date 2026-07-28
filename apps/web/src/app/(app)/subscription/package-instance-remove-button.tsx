"use client";

import { LoaderCircle, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { removePackageUazapiInstanceAction } from "./actions";

type PackageInstanceRemoveButtonProps = {
  instanceId: string;
  instanceName: string;
  phone: string | null;
};

export function PackageInstanceRemoveButton({
  instanceId,
  instanceName,
  phone,
}: PackageInstanceRemoveButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setConfirmation("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    if (isPending) {
      return;
    }
    dialogRef.current?.close();
    setConfirmation("");
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await removePackageUazapiInstanceAction(
        instanceId,
        confirmation,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }

      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        className="package-instance-remove-trigger"
        type="button"
        aria-label={`Remover numero ${instanceName}`}
        title="Remover numero"
        onClick={openDialog}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>

      <dialog
        className="meta-action-dialog package-instance-remove-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          if (isPending) {
            event.preventDefault();
            return;
          }
          closeDialog();
        }}
      >
        <div className="meta-action-dialog-header">
          <div>
            <span className="micro-label">Remover numero WhatsApp</span>
            <h3>{instanceName}</h3>
          </div>
          <button
            className="meta-dialog-close"
            type="button"
            aria-label="Fechar confirmacao"
            title="Fechar"
            onClick={closeDialog}
            disabled={isPending}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <form className="meta-action-form" onSubmit={handleSubmit}>
          <div className="package-instance-remove-warning">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>O WhatsApp sera desconectado</strong>
              <p>
                A instancia sera removida da Uazapi e deixara de receber
                mensagens. A vaga volta ao pacote imediatamente.
              </p>
            </div>
          </div>

          <div className="package-instance-remove-preserved">
            <strong>A assinatura nao sera cancelada.</strong>
            <span>
              Leads, eventos e auditorias anteriores permanecem preservados.
              {phone ? ` Numero atual: ${phone}.` : ""}
            </span>
          </div>

          <label
            className="package-instance-remove-confirmation"
            htmlFor={`remove-instance-${instanceId}`}
          >
            <span>
              Digite <strong>{instanceName}</strong> para confirmar
            </span>
            <input
              id={`remove-instance-${instanceId}`}
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              disabled={isPending}
            />
          </label>

          {error ? (
            <div className="feedback-banner error" role="alert">
              <strong>Remocao nao concluida</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="meta-action-dialog-footer">
            <button
              className="button"
              type="button"
              onClick={closeDialog}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              type="submit"
              disabled={confirmation.trim() !== instanceName || isPending}
            >
              {isPending ? (
                <LoaderCircle
                  className="package-instance-remove-spinner"
                  size={16}
                  aria-hidden="true"
                />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
              {isPending ? "Removendo..." : "Remover numero"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
