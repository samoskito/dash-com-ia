"use client";

import type {
  MetaConnectionCapabilitiesDto,
  MetaManualAssetDiscoveryDto,
  MetaManualConfigurationDto,
} from "@wpptrack/shared";
import { META_OAUTH_DISCONNECT_CONFIRMATION } from "@wpptrack/shared";
import {
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  Database,
  History,
  KeyRound,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Unplug,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { SearchableSelect } from "../../../components/searchable-select";
import type { MetaManualActionResult } from "./meta-manual-actions";

type SetupMode = "quick" | "advanced";
type DestinationMode = "discovered" | "direct" | "existing";

export function parseMetaAdAccountIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (/^\d+$/.test(item) ? `act_${item}` : item))
        .map((item) => item.replace(/^act_/i, "act_"))
        .filter((item) => /^act_\d+$/i.test(item)),
    ),
  ];
}

type MetaManualConnectionPanelProps = {
  workspaceId: string;
  capabilities: MetaConnectionCapabilitiesDto;
  initialConfiguration: MetaManualConfigurationDto | null;
  legacyConnected: boolean;
  canManage: boolean;
  disconnectOAuthAction: (
    workspaceId: string,
    confirmation: string,
  ) => Promise<MetaManualActionResult>;
  createCredentialAction: (
    formData: FormData,
  ) => Promise<MetaManualActionResult>;
  discoverAssetsAction: (
    credentialId: string,
    businessId?: string | null,
  ) => Promise<MetaManualActionResult>;
  createConnectionAction: (
    formData: FormData,
  ) => Promise<MetaManualActionResult>;
  rotateCredentialAction: (
    credentialId: string,
    formData: FormData,
  ) => Promise<MetaManualActionResult>;
  setConnectionStatusAction: (
    connectionId: string,
    status: "active" | "paused",
  ) => Promise<MetaManualActionResult>;
  testConnectionAction: (
    connectionId: string,
  ) => Promise<MetaManualActionResult>;
  removeConnectionAction: (
    connectionId: string,
    businessManagerId: string,
  ) => Promise<MetaManualActionResult>;
  syncHistoryAction: () => Promise<MetaManualActionResult>;
  setAccountDestinationAction: (
    reportingAccountId: string,
    conversionDestinationId: string | null,
  ) => Promise<MetaManualActionResult>;
};

type LegacyOAuthMigrationCardProps = {
  workspaceId: string;
  canManage: boolean;
  disconnectOAuthAction: MetaManualConnectionPanelProps["disconnectOAuthAction"];
};

function LegacyOAuthMigrationCard({
  workspaceId,
  canManage,
  disconnectOAuthAction,
}: LegacyOAuthMigrationCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation === META_OAUTH_DISCONNECT_CONFIRMATION;

  function closeDialog() {
    if (pending) {
      return;
    }

    dialogRef.current?.close();
    setConfirmation("");
    setError(null);
  }

  async function handleDisconnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!confirmed || pending) {
      return;
    }

    setPending(true);
    setError(null);
    const result = await disconnectOAuthAction(workspaceId, confirmation);

    if (result.ok) {
      dialogRef.current?.close();
      window.location.reload();
      return;
    }

    setError(result.message);
    setPending(false);
  }

  return (
    <>
      <div className="meta-manual-entry locked">
        <div className="meta-manual-entry-icon" aria-hidden="true">
          <ShieldCheck size={18} />
        </div>
        <div>
          <span className="micro-label">Conexao alternativa</span>
          <strong>Token permanente</strong>
          <p className="muted">
            O OAuth continua ativo ate uma desconexao confirmada neste
            workspace. O historico permanece preservado durante a troca.
          </p>
        </div>
        {canManage ? (
          <button
            className="button danger"
            type="button"
            onClick={() => dialogRef.current?.showModal()}
          >
            <Unplug size={16} aria-hidden="true" />
            Desconectar OAuth
          </button>
        ) : (
          <span className="event-chip">OAuth preservado</span>
        )}
      </div>

      <dialog
        className="meta-action-dialog meta-oauth-disconnect-dialog"
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
            <span className="micro-label">Troca de conexao</span>
            <h3>Desconectar a Meta deste workspace?</h3>
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

        <form className="meta-action-form" onSubmit={handleDisconnect}>
          <div className="meta-disconnect-warning">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>Reporting e CAPI serao interrompidos</strong>
              <p>
                O envio volta somente depois que o token permanente, a BM, as
                contas e o destino forem validados.
              </p>
            </div>
          </div>

          <ul className="meta-disconnect-preserved">
            <li>Eventos, campanhas e auditorias ja registrados permanecem.</li>
            <li>Snapshots, contas e destinos salvos nao serao apagados.</li>
            <li>Outros workspaces e a autorizacao no Facebook nao mudam.</li>
          </ul>

          <label
            className="field-label"
            htmlFor="meta-oauth-disconnect-confirmation"
          >
            Digite <strong>{META_OAUTH_DISCONNECT_CONFIRMATION}</strong> para
            confirmar
          </label>
          <input
            id="meta-oauth-disconnect-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending}
          />

          {error ? (
            <div className="feedback-banner error" role="alert">
              <span>{error}</span>
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
              disabled={!confirmed || pending}
            >
              <Unplug size={16} aria-hidden="true" />
              {pending ? "Desconectando..." : "Desconectar e usar token"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function MetaManualConnectionPanel({
  workspaceId,
  capabilities,
  initialConfiguration,
  legacyConnected,
  canManage,
  disconnectOAuthAction,
  createCredentialAction,
  discoverAssetsAction,
  createConnectionAction,
  rotateCredentialAction,
  setConnectionStatusAction,
  testConnectionAction,
  removeConnectionAction,
  syncHistoryAction,
  setAccountDestinationAction,
}: MetaManualConnectionPanelProps) {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>("quick");
  const [discovery, setDiscovery] =
    useState<MetaManualAssetDiscoveryDto | null>(null);
  const [credentialId, setCredentialId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [businessLookupId, setBusinessLookupId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [directAccountIds, setDirectAccountIds] = useState("");
  const [destinationMode, setDestinationMode] =
    useState<DestinationMode>("discovered");
  const [pixelId, setPixelId] = useState("");
  const [pageId, setPageId] = useState("");
  const [existingDestinationId, setExistingDestinationId] = useState("");
  const [directPixelId, setDirectPixelId] = useState("");
  const [directPageId, setDirectPageId] = useState("");
  const [ownerBusinessManagerId, setOwnerBusinessManagerId] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [rotatingCredentialId, setRotatingCredentialId] = useState<
    string | null
  >(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null,
  );
  const [removingConnectionId, setRemovingConnectionId] = useState<
    string | null
  >(null);
  const [removalConfirmation, setRemovalConfirmation] = useState("");
  const [accountDestinationDrafts, setAccountDestinationDrafts] = useState<
    Record<string, string>
  >({});
  const credentialFormRef = useRef<HTMLFormElement>(null);
  const rotateFormRef = useRef<HTMLFormElement>(null);
  const removeDialogRef = useRef<HTMLDialogElement>(null);

  const selectedBusiness = discovery?.businesses.find(
    (business) => business.id === businessId,
  );
  const selectedCredential = configuration?.credentials.find(
    (credential) => credential.id === credentialId,
  );
  const selectedPixel = discovery?.pixels.find((pixel) => pixel.id === pixelId);
  const selectedPage = discovery?.pages.find((page) => page.id === pageId);
  const selectedExistingDestination = configuration?.destinations.find(
    (destination) => destination.id === existingDestinationId,
  );
  const discoveredAccountIds = new Set(
    discovery?.adAccounts.map((account) => account.id) ?? [],
  );
  const selectedDirectAccountIds = selectedAccountIds.filter(
    (accountId) => !discoveredAccountIds.has(accountId),
  );
  const showBusinessLookup = Boolean(
    credentialId &&
    ((discovery?.businesses.length ?? 0) === 0 || setupMode === "advanced"),
  );
  const showAccountLookup = Boolean(
    businessId &&
    ((discovery?.adAccounts.length ?? 0) === 0 || setupMode === "advanced"),
  );
  const destinationReady =
    destinationMode === "existing"
      ? Boolean(existingDestinationId)
      : destinationMode === "direct"
        ? Boolean(directPixelId.trim() && directPageId.trim())
        : Boolean(pixelId && pageId);
  const readyToActivate = Boolean(
    credentialId &&
    businessId &&
    selectedAccountIds.length > 0 &&
    destinationReady,
  );
  const removingConnection = configuration?.businessConnections.find(
    (connection) => connection.id === removingConnectionId,
  );

  if (!capabilities.manualEnabled) {
    return null;
  }

  if (legacyConnected) {
    return (
      <LegacyOAuthMigrationCard
        workspaceId={workspaceId}
        canManage={canManage}
        disconnectOAuthAction={disconnectOAuthAction}
      />
    );
  }

  async function handleCredentialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("credential");
    setNotice(null);
    const result = await createCredentialAction(
      new FormData(event.currentTarget),
    );

    if (result.ok && result.discovery) {
      applyDiscovery(result.discovery);
      setBusinessLookupId("");
      setDirectAccountIds("");
      credentialFormRef.current?.reset();
      await refreshConfigurationFromServerState(result);
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleCredentialSelection(nextCredentialId: string) {
    setCredentialId(nextCredentialId);
    setBusinessId("");
    setBusinessLookupId("");
    setSelectedAccountIds([]);
    setDirectAccountIds("");
    setDiscovery(null);

    if (!nextCredentialId) {
      return;
    }

    setPendingAction("assets");
    const result = await discoverAssetsAction(nextCredentialId, null);

    if (result.ok && result.discovery) {
      applyDiscovery(result.discovery);
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleBusinessSelection(nextBusinessId: string) {
    setBusinessId(nextBusinessId);
    setSelectedAccountIds([]);
    setDirectAccountIds("");
    setPixelId("");
    setPageId("");

    if (!credentialId || !nextBusinessId) {
      return;
    }

    setPendingAction("assets");
    const result = await discoverAssetsAction(credentialId, nextBusinessId);

    if (result.ok && result.discovery) {
      applyDiscovery(result.discovery, nextBusinessId);
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleBusinessLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBusinessId = businessLookupId.trim();

    if (!credentialId || !nextBusinessId) {
      setNotice({
        tone: "error",
        message: "Informe o ID da BM que pertence a este token.",
      });
      return;
    }

    setPendingAction("assets");
    setNotice(null);
    const result = await discoverAssetsAction(credentialId, nextBusinessId);

    if (result.ok && result.discovery) {
      applyDiscovery(result.discovery, nextBusinessId);
      setBusinessLookupId("");
    }

    showResult(result);
    setPendingAction(null);
  }

  function handleDirectAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accountIds = parseMetaAdAccountIds(directAccountIds);

    if (accountIds.length === 0) {
      setNotice({
        tone: "error",
        message: "Informe ao menos uma conta no formato act_123 ou 123.",
      });
      return;
    }

    setSelectedAccountIds((current) => [
      ...new Set([...current, ...accountIds]),
    ]);
    setDirectAccountIds("");
    setNotice({
      tone: "success",
      message:
        "IDs adicionados. O acesso a cada conta sera validado antes da ativacao.",
    });
  }

  async function handleConnectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!readyToActivate || !selectedBusiness) {
      setNotice({
        tone: "error",
        message: "Revise BM, contas e destino antes de ativar.",
      });
      return;
    }

    const formData = new FormData();
    formData.set("credentialId", credentialId);
    formData.set("businessManagerId", businessId);
    formData.set("businessManagerName", selectedBusiness.name);
    selectedAccountIds.forEach((id) => formData.append("adAccountIds", id));
    formData.set(
      "destinationMode",
      destinationMode === "existing" ? "existing" : "new",
    );

    if (destinationMode === "existing") {
      formData.set("existingDestinationId", existingDestinationId);
    } else {
      formData.set(
        "pixelId",
        destinationMode === "direct" ? directPixelId.trim() : pixelId,
      );
      formData.set(
        "pageId",
        destinationMode === "direct" ? directPageId.trim() : pageId,
      );
      formData.set(
        "destinationLabel",
        destinationMode === "direct"
          ? "Destino informado por ID"
          : `${selectedPixel?.name ?? "Pixel"} / ${selectedPage?.name ?? "Pagina"}`,
      );

      if (ownerBusinessManagerId.trim()) {
        formData.set("ownerBusinessManagerId", ownerBusinessManagerId.trim());
      }
    }

    setPendingAction("activate");
    setNotice(null);
    const result = await createConnectionAction(formData);

    if (result.ok && result.configuration) {
      setConfiguration(result.configuration);
      resetSetup();
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleConnectionTest(connectionId: string) {
    setPendingAction(`test:${connectionId}`);
    const result = await testConnectionAction(connectionId);
    showResult(result);
    setPendingAction(null);
  }

  async function handleHistorySync() {
    setPendingAction("history");
    setNotice(null);
    const result = await syncHistoryAction();
    showResult(result);
    setPendingAction(null);
  }

  async function handleEditConnection(connectionId: string) {
    const connection = configuration?.businessConnections.find(
      (item) => item.id === connectionId,
    );

    if (!connection) {
      return;
    }

    const connectionAccounts =
      configuration?.reportingAccounts.filter(
        (account) =>
          account.businessConnectionId === connection.id && account.active,
      ) ?? [];

    setSetupOpen(true);
    setSetupMode("advanced");
    setPendingAction(`edit:${connectionId}`);
    setNotice(null);
    const result = await discoverAssetsAction(
      connection.credentialId,
      connection.businessManagerId,
    );

    if (result.ok && result.discovery) {
      setDiscovery(result.discovery);
      setCredentialId(connection.credentialId);
      setBusinessId(connection.businessManagerId);
      setBusinessLookupId("");
      setSelectedAccountIds(
        connectionAccounts.map((account) => account.adAccountId),
      );
      setDirectAccountIds("");
      setDestinationMode("existing");
      setExistingDestinationId(connection.defaultConversionDestinationId ?? "");
      setEditingConnectionId(connection.id);
      setNotice({
        tone: "success",
        message: "Estrutura carregada. Revise e salve as alteracoes.",
      });
    } else {
      showResult(result);
    }

    setPendingAction(null);
  }

  async function handleRemoveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const connection = configuration?.businessConnections.find(
      (item) => item.id === removingConnectionId,
    );

    if (
      !connection ||
      removalConfirmation.trim() !== connection.businessManagerId
    ) {
      return;
    }

    setPendingAction(`remove:${connection.id}`);
    const result = await removeConnectionAction(
      connection.id,
      removalConfirmation.trim(),
    );

    if (result.ok && result.configuration) {
      setConfiguration(result.configuration);
      removeDialogRef.current?.close();
      setRemovingConnectionId(null);
      setRemovalConfirmation("");

      if (editingConnectionId === connection.id) {
        resetSetup();
      }
    }

    showResult(result);
    setPendingAction(null);
  }

  function openRemovalDialog(connectionId: string) {
    setRemovingConnectionId(connectionId);
    setRemovalConfirmation("");
    removeDialogRef.current?.showModal();
  }

  function closeRemovalDialog() {
    if (pendingAction?.startsWith("remove:")) {
      return;
    }

    removeDialogRef.current?.close();
    setRemovingConnectionId(null);
    setRemovalConfirmation("");
  }

  async function handleConnectionStatus(
    connectionId: string,
    status: "active" | "paused",
  ) {
    const confirmation =
      status === "paused"
        ? "Pausar esta BM? Somente as contas desta conexao deixarao de sincronizar e enviar eventos."
        : "Reativar esta BM com o token e o destino atuais?";

    if (!window.confirm(confirmation)) {
      return;
    }

    setPendingAction(`status:${connectionId}`);
    const result = await setConnectionStatusAction(connectionId, status);

    if (result.ok && result.configuration) {
      setConfiguration(result.configuration);
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleRotateCredential(
    event: FormEvent<HTMLFormElement>,
    targetCredentialId: string,
  ) {
    event.preventDefault();

    if (
      !window.confirm(
        "Substituir o token desta credencial? A troca so sera aplicada se toda a estrutura continuar acessivel.",
      )
    ) {
      return;
    }

    setPendingAction(`rotate:${targetCredentialId}`);
    const result = await rotateCredentialAction(
      targetCredentialId,
      new FormData(event.currentTarget),
    );

    if (result.ok && result.configuration) {
      setConfiguration(result.configuration);
      setRotatingCredentialId(null);
      rotateFormRef.current?.reset();
    }

    showResult(result);
    setPendingAction(null);
  }

  async function handleAccountDestination(accountId: string) {
    const draft = accountDestinationDrafts[accountId] ?? "";
    setPendingAction(`destination:${accountId}`);
    const result = await setAccountDestinationAction(accountId, draft || null);

    if (result.ok && result.configuration) {
      setConfiguration(result.configuration);
    }

    showResult(result);
    setPendingAction(null);
  }

  function applyDiscovery(
    nextDiscovery: MetaManualAssetDiscoveryDto,
    forcedBusinessId?: string,
  ) {
    const nextBusinessId =
      forcedBusinessId ?? nextDiscovery.selectedBusinessId ?? "";
    setDiscovery(nextDiscovery);
    setCredentialId(nextDiscovery.credential.id);
    setBusinessId(nextBusinessId);
    setSelectedAccountIds([]);
    setDirectAccountIds("");
    setPixelId(nextDiscovery.pixels[0]?.id ?? "");
    setPageId(nextDiscovery.pages[0]?.id ?? "");
    setDestinationMode(
      nextDiscovery.pixels.length > 0 && nextDiscovery.pages.length > 0
        ? "discovered"
        : "direct",
    );
  }

  function showResult(result: MetaManualActionResult) {
    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function refreshConfigurationFromServerState(
    result: MetaManualActionResult,
  ) {
    if (result.configuration) {
      setConfiguration(result.configuration);
      return;
    }

    if (result.discovery) {
      const credential = result.discovery.credential;
      setConfiguration((current) => ({
        workspaceId: credential.workspaceId,
        credentials: [
          ...(current?.credentials.filter(
            (item) => item.id !== credential.id,
          ) ?? []),
          credential,
        ],
        businessConnections: current?.businessConnections ?? [],
        destinations: current?.destinations ?? [],
        reportingAccounts: current?.reportingAccounts ?? [],
      }));
    }
  }

  function resetSetup() {
    setSetupOpen(false);
    setDiscovery(null);
    setCredentialId("");
    setBusinessId("");
    setBusinessLookupId("");
    setSelectedAccountIds([]);
    setDirectAccountIds("");
    setDestinationMode("discovered");
    setPixelId("");
    setPageId("");
    setExistingDestinationId("");
    setDirectPixelId("");
    setDirectPageId("");
    setOwnerBusinessManagerId("");
    setEditingConnectionId(null);
  }

  function startNewConnection() {
    resetSetup();
    setSetupOpen(true);
    setSetupMode("quick");
    setNotice(null);
  }

  function renderConfiguredConnections(showNewConnection: boolean) {
    if ((configuration?.businessConnections.length ?? 0) === 0) {
      return null;
    }

    return (
      <div className="meta-advanced-list">
        <div className="meta-advanced-list-heading">
          <div>
            <span className="eyebrow">Estruturas configuradas</span>
            <h3>Tokens, BMs e destinos</h3>
          </div>
          {showNewConnection && canManage ? (
            <div className="meta-advanced-list-actions">
              <button
                className="button secondary"
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleHistorySync()}
              >
                <History size={16} />
                {pendingAction === "history"
                  ? "Enfileirando..."
                  : "Importar 90 dias"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={startNewConnection}
              >
                <Plus size={16} /> Nova conexao
              </button>
            </div>
          ) : null}
        </div>
        {configuration?.businessConnections.map((connection) => {
          const credential = configuration.credentials.find(
            (item) => item.id === connection.credentialId,
          );
          const destination = configuration.destinations.find(
            (item) => item.id === connection.defaultConversionDestinationId,
          );
          const connectionAccounts = configuration.reportingAccounts.filter(
            (account) => account.businessConnectionId === connection.id,
          );
          const activeConnectionAccounts = connectionAccounts.filter(
            (account) => account.active,
          );

          return (
            <article className="meta-connection-row" key={connection.id}>
              <div className="meta-connection-row-head">
                <div>
                  <span
                    className={`event-chip${connection.status === "active" ? "" : " warn"}`}
                  >
                    {statusLabel(connection.status)}
                  </span>
                  <strong>{connection.businessManagerName}</strong>
                  <span>{connection.businessManagerId}</span>
                </div>
                {canManage ? (
                  <div className="meta-connection-row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      title="Editar estrutura"
                      aria-label={`Editar ${connection.businessManagerName}`}
                      disabled={pendingAction !== null}
                      onClick={() => void handleEditConnection(connection.id)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Testar conexao"
                      aria-label={`Testar ${connection.businessManagerName}`}
                      disabled={pendingAction !== null}
                      onClick={() => void handleConnectionTest(connection.id)}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title={
                        connection.status === "paused"
                          ? "Reativar conexao"
                          : "Pausar conexao"
                      }
                      aria-label={
                        connection.status === "paused"
                          ? `Reativar ${connection.businessManagerName}`
                          : `Pausar ${connection.businessManagerName}`
                      }
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void handleConnectionStatus(
                          connection.id,
                          connection.status === "paused" ? "active" : "paused",
                        )
                      }
                    >
                      {connection.status === "paused" ? (
                        <Play size={16} />
                      ) : (
                        <Pause size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Trocar token"
                      aria-label={`Trocar token de ${connection.businessManagerName}`}
                      disabled={!credential || pendingAction !== null}
                      onClick={() =>
                        setRotatingCredentialId(credential?.id ?? null)
                      }
                    >
                      <KeyRound size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Remover estrutura"
                      aria-label={`Remover ${connection.businessManagerName}`}
                      disabled={pendingAction !== null}
                      onClick={() => openRemovalDialog(connection.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="meta-connection-facts">
                <span>
                  <small>Credencial</small>
                  <strong>{credential?.label ?? "Indisponivel"}</strong>
                </span>
                <span>
                  <small>Token</small>
                  <strong>
                    {credential
                      ? `final ${credential.tokenLast4}`
                      : "Indisponivel"}
                  </strong>
                </span>
                <span>
                  <small>Destino padrao</small>
                  <strong>
                    {destination?.label ??
                      destination?.pixelName ??
                      "Nao configurado"}
                  </strong>
                </span>
                <span>
                  <small>Contas</small>
                  <strong>
                    {connection.activeReportingAccountCount}/
                    {connection.reportingAccountCount} ativas
                  </strong>
                </span>
              </div>

              {rotatingCredentialId === credential?.id ? (
                <form
                  ref={rotateFormRef}
                  className="meta-rotate-form"
                  onSubmit={(event) =>
                    void handleRotateCredential(event, credential.id)
                  }
                >
                  <input
                    name="accessToken"
                    type="password"
                    minLength={20}
                    autoComplete="off"
                    placeholder="Novo token permanente"
                    required
                  />
                  <button
                    className="button secondary"
                    type="submit"
                    disabled={pendingAction !== null}
                  >
                    {pendingAction === `rotate:${credential.id}`
                      ? "Validando..."
                      : "Validar troca"}
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setRotatingCredentialId(null)}
                  >
                    Cancelar
                  </button>
                </form>
              ) : null}

              {canManage && activeConnectionAccounts.length > 0 ? (
                <div className="meta-account-sync-list">
                  {activeConnectionAccounts.map((account) => (
                    <div
                      className={account.syncStatus === "error" ? "error" : ""}
                      key={`sync:${account.id}`}
                    >
                      <span>
                        <strong>{account.adAccountName}</strong>
                        <small>{account.adAccountId}</small>
                      </span>
                      <span className="event-chip">
                        {syncStatusLabel(account.syncStatus)}
                      </span>
                      <small>{accountSyncDetail(account)}</small>
                    </div>
                  ))}
                </div>
              ) : null}

              {activeConnectionAccounts.length > 0 ? (
                <div className="meta-account-overrides">
                  {activeConnectionAccounts.map((account) => (
                    <div key={account.id}>
                      <span>
                        <strong>{account.adAccountName}</strong>
                        <small>{account.adAccountId}</small>
                      </span>
                      <select
                        aria-label={`Destino de ${account.adAccountName}`}
                        value={
                          accountDestinationDrafts[account.id] ??
                          account.conversionDestinationId ??
                          ""
                        }
                        onChange={(event) =>
                          setAccountDestinationDrafts((current) => ({
                            ...current,
                            [account.id]: event.currentTarget.value,
                          }))
                        }
                      >
                        <option value="">Padrao da BM</option>
                        {configuration.destinations.map((item) => (
                          <option key={item.id} value={item.id ?? ""}>
                            {item.label ?? item.pixelName ?? item.pixelId}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() =>
                          void handleAccountDestination(account.id)
                        }
                      >
                        Salvar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="meta-manual-panel">
      <button
        className="meta-manual-entry"
        type="button"
        onClick={() => setSetupOpen((current) => !current)}
        aria-expanded={setupOpen}
        disabled={!canManage}
      >
        <span className="meta-manual-entry-icon" aria-hidden="true">
          <KeyRound size={18} />
        </span>
        <span className="meta-manual-entry-copy">
          <span className="micro-label">Outra forma de conectar</span>
          <strong>Usar token permanente</strong>
          <span className="muted">
            Para estruturas operadas por token de usuario do sistema.
          </span>
        </span>
        <span className="meta-manual-entry-action">
          {configuration?.businessConnections.length ?? 0} BMs
          <ChevronDown size={16} />
        </span>
      </button>

      {setupOpen ? (
        <div className="meta-manual-workspace">
          <div className="meta-manual-toolbar">
            <div>
              <span className="eyebrow">Conexao por token</span>
              <h3>
                {editingConnectionId
                  ? "Editar estrutura Meta"
                  : "Configurar estrutura Meta"}
              </h3>
            </div>
            <div
              className="segmented-control"
              aria-label="Tipo de configuracao"
            >
              <button
                type="button"
                className={setupMode === "quick" ? "active" : ""}
                aria-pressed={setupMode === "quick"}
                onClick={() => setSetupMode("quick")}
              >
                Rapida
              </button>
              <button
                type="button"
                className={setupMode === "advanced" ? "active" : ""}
                aria-pressed={setupMode === "advanced"}
                onClick={() => setSetupMode("advanced")}
              >
                Avancada
              </button>
            </div>
          </div>

          <ol className="meta-setup-steps" aria-label="Etapas da conexao">
            <SetupStep
              active={!credentialId}
              done={Boolean(credentialId)}
              label="Token"
            />
            <SetupStep
              active={Boolean(credentialId && !businessId)}
              done={Boolean(businessId)}
              label="BM"
            />
            <SetupStep
              active={Boolean(businessId && selectedAccountIds.length === 0)}
              done={selectedAccountIds.length > 0}
              label="Contas"
            />
            <SetupStep
              active={selectedAccountIds.length > 0 && !destinationReady}
              done={destinationReady}
              label="Destino"
            />
            <SetupStep active={readyToActivate} done={false} label="Revisao" />
          </ol>

          <div className="meta-setup-grid">
            <section className="meta-setup-section">
              <div className="meta-setup-heading">
                <KeyRound size={17} />
                <div>
                  <span className="micro-label">1. Credencial</span>
                  <strong>Token permanente</strong>
                </div>
              </div>
              {(configuration?.credentials.length ?? 0) > 0 ? (
                <SearchableSelect
                  name="credentialId"
                  value={credentialId}
                  options={(configuration?.credentials ?? []).map((item) => ({
                    value: item.id,
                    label: item.label,
                    description: `final ${item.tokenLast4} | ${statusLabel(item.status)}`,
                  }))}
                  onValueChange={handleCredentialSelection}
                  ariaLabel="Credencial Meta"
                  placeholder="Escolher token salvo"
                  disabled={pendingAction !== null}
                />
              ) : null}
              <form
                ref={credentialFormRef}
                className="meta-token-form"
                onSubmit={handleCredentialSubmit}
              >
                <label>
                  <span>Nome da credencial</span>
                  <input
                    name="label"
                    type="text"
                    minLength={2}
                    maxLength={80}
                    placeholder="Ex.: Token BM principal"
                    required
                  />
                </label>
                <label>
                  <span>Token do usuario do sistema</span>
                  <input
                    name="accessToken"
                    type="password"
                    minLength={20}
                    autoComplete="off"
                    placeholder="Cole o token permanente"
                    required
                  />
                </label>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={pendingAction !== null}
                >
                  <ShieldCheck size={16} />
                  {pendingAction === "credential"
                    ? "Validando..."
                    : "Validar e proteger"}
                </button>
              </form>
              <p className="action-note">
                Depois de salvo, o token nao pode ser visualizado. Uma troca
                exige informar o novo token e validar novamente toda a conexao.
              </p>
            </section>

            <section className="meta-setup-section">
              <div className="meta-setup-heading">
                <Building2 size={17} />
                <div>
                  <span className="micro-label">2. Estrutura anunciante</span>
                  <strong>BM e contas de anuncio</strong>
                </div>
              </div>
              <SearchableSelect
                name="businessManagerId"
                value={businessId}
                options={(discovery?.businesses ?? []).map((business) => ({
                  value: business.id,
                  label: business.name,
                  description: business.id,
                }))}
                onValueChange={handleBusinessSelection}
                ariaLabel="Business Manager"
                placeholder="Escolher BM"
                disabled={!credentialId || pendingAction !== null}
              />
              {showBusinessLookup ? (
                <div className="meta-direct-asset-entry">
                  <div>
                    <span className="micro-label">BM nao enumerada</span>
                    <p className="muted">
                      Informe o ID da BM vinculada ao usuario do sistema.
                    </p>
                  </div>
                  <form
                    className="meta-inline-id-form"
                    onSubmit={handleBusinessLookup}
                  >
                    <label>
                      <span>ID da BM</span>
                      <input
                        value={businessLookupId}
                        onChange={(event) =>
                          setBusinessLookupId(event.currentTarget.value)
                        }
                        placeholder="Ex.: 123456789012345"
                        inputMode="numeric"
                        disabled={pendingAction !== null}
                      />
                    </label>
                    <button
                      className="button secondary"
                      type="submit"
                      disabled={
                        !businessLookupId.trim() || pendingAction !== null
                      }
                    >
                      <RefreshCw size={15} aria-hidden="true" />
                      {pendingAction === "assets"
                        ? "Validando..."
                        : "Validar BM"}
                    </button>
                  </form>
                </div>
              ) : null}
              <div className="meta-account-picker">
                {(discovery?.adAccounts ?? []).length > 0 ? (
                  discovery?.adAccounts.map((account) => {
                    const checked = selectedAccountIds.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className={checked ? "selected" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedAccountIds((current) =>
                              current.includes(account.id)
                                ? current.filter((id) => id !== account.id)
                                : [...current, account.id],
                            )
                          }
                        />
                        <span>
                          <strong>{account.name}</strong>
                          <small>{account.id}</small>
                        </span>
                        {checked ? <Check size={16} /> : null}
                      </label>
                    );
                  })
                ) : (
                  <p className="muted">
                    {pendingAction === "assets"
                      ? "Consultando ativos..."
                      : businessId
                        ? "A Meta nao listou contas para esta BM. Informe os IDs abaixo."
                        : "Escolha um token e uma BM para carregar as contas."}
                  </p>
                )}
              </div>
              {selectedDirectAccountIds.length > 0 ? (
                <div
                  className="meta-direct-account-list"
                  aria-label="Contas informadas por ID"
                >
                  {selectedDirectAccountIds.map((accountId) => (
                    <div key={accountId}>
                      <span>
                        <strong>Conta informada</strong>
                        <small>{accountId}</small>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover ${accountId}`}
                        title="Remover conta"
                        onClick={() =>
                          setSelectedAccountIds((current) =>
                            current.filter((id) => id !== accountId),
                          )
                        }
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {showAccountLookup ? (
                <form
                  className="meta-direct-account-form"
                  onSubmit={handleDirectAccounts}
                >
                  <label>
                    <span>IDs das contas de anuncio</span>
                    <textarea
                      value={directAccountIds}
                      onChange={(event) =>
                        setDirectAccountIds(event.currentTarget.value)
                      }
                      placeholder="act_1234567890, act_9876543210"
                      rows={2}
                      disabled={pendingAction !== null}
                    />
                  </label>
                  <button
                    className="button secondary"
                    type="submit"
                    disabled={
                      !directAccountIds.trim() || pendingAction !== null
                    }
                  >
                    <Plus size={15} aria-hidden="true" />
                    Adicionar IDs
                  </button>
                </form>
              ) : null}
            </section>

            <section className="meta-setup-section meta-setup-destination">
              <div className="meta-setup-heading">
                <Database size={17} />
                <div>
                  <span className="micro-label">3. Destino CAPI</span>
                  <strong>Pixel/Dataset e Pagina</strong>
                </div>
              </div>
              {setupMode === "advanced" ? (
                <div
                  className="segmented-control compact"
                  aria-label="Origem do destino"
                >
                  <button
                    type="button"
                    className={destinationMode === "discovered" ? "active" : ""}
                    onClick={() => setDestinationMode("discovered")}
                  >
                    Ativos encontrados
                  </button>
                  <button
                    type="button"
                    className={destinationMode === "direct" ? "active" : ""}
                    onClick={() => setDestinationMode("direct")}
                  >
                    Informar IDs
                  </button>
                  {(configuration?.destinations.length ?? 0) > 0 ? (
                    <button
                      type="button"
                      className={destinationMode === "existing" ? "active" : ""}
                      onClick={() => setDestinationMode("existing")}
                    >
                      Reutilizar destino
                    </button>
                  ) : null}
                </div>
              ) : null}

              {destinationMode === "existing" ? (
                <SearchableSelect
                  name="existingDestinationId"
                  value={existingDestinationId}
                  options={(configuration?.destinations ?? [])
                    .map((item) => ({
                      value: item.id ?? "",
                      label: item.label ?? item.pixelName ?? "Destino Meta",
                      description: `${item.pixelId} / ${item.pageId}`,
                    }))
                    .filter((item) => Boolean(item.value))}
                  onValueChange={setExistingDestinationId}
                  ariaLabel="Destino compartilhado"
                  placeholder="Escolher destino validado"
                />
              ) : destinationMode === "direct" ? (
                <div className="meta-direct-destination-grid">
                  <label>
                    <span>ID do Pixel/Dataset</span>
                    <input
                      value={directPixelId}
                      onChange={(event) =>
                        setDirectPixelId(event.currentTarget.value)
                      }
                      placeholder="Ex.: 1234567890"
                    />
                  </label>
                  <label>
                    <span>ID da Pagina Facebook</span>
                    <input
                      value={directPageId}
                      onChange={(event) =>
                        setDirectPageId(event.currentTarget.value)
                      }
                      placeholder="Ex.: 9876543210"
                    />
                  </label>
                  <label>
                    <span>BM proprietaria dos ativos</span>
                    <input
                      value={ownerBusinessManagerId}
                      onChange={(event) =>
                        setOwnerBusinessManagerId(event.currentTarget.value)
                      }
                      placeholder="Opcional para ativos compartilhados"
                    />
                  </label>
                </div>
              ) : (
                <div className="meta-discovered-destination-grid">
                  <SearchableSelect
                    name="pixelId"
                    value={pixelId}
                    options={(discovery?.pixels ?? []).map((pixel) => ({
                      value: pixel.id,
                      label: pixel.name,
                      description: pixel.id,
                    }))}
                    onValueChange={setPixelId}
                    ariaLabel="Pixel ou Dataset"
                    placeholder="Escolher Pixel/Dataset"
                    disabled={!businessId}
                  />
                  <SearchableSelect
                    name="pageId"
                    value={pageId}
                    options={(discovery?.pages ?? []).map((page) => ({
                      value: page.id,
                      label: page.name,
                      description: page.id,
                    }))}
                    onValueChange={setPageId}
                    ariaLabel="Pagina Facebook"
                    placeholder="Escolher Pagina"
                    disabled={!businessId}
                  />
                </div>
              )}
            </section>

            <section className="meta-setup-section meta-setup-review">
              <div className="meta-setup-heading">
                <CircleCheck size={17} />
                <div>
                  <span className="micro-label">4. Revisao</span>
                  <strong>Ativar conexao</strong>
                </div>
              </div>
              <dl className="meta-review-list">
                <div>
                  <dt>Token</dt>
                  <dd>
                    {selectedCredential?.label ??
                      discovery?.credential.label ??
                      "Pendente"}
                  </dd>
                </div>
                <div>
                  <dt>BM</dt>
                  <dd>{selectedBusiness?.name ?? "Pendente"}</dd>
                </div>
                <div>
                  <dt>Contas</dt>
                  <dd>{selectedAccountIds.length || "Pendente"}</dd>
                </div>
                <div>
                  <dt>Destino</dt>
                  <dd>
                    {destinationMode === "existing"
                      ? (selectedExistingDestination?.label ?? "Pendente")
                      : destinationMode === "direct"
                        ? directPixelId && directPageId
                          ? `${directPixelId} / ${directPageId}`
                          : "Pendente"
                        : selectedPixel && selectedPage
                          ? `${selectedPixel.name} / ${selectedPage.name}`
                          : "Pendente"}
                  </dd>
                </div>
              </dl>
              <form onSubmit={handleConnectionSubmit}>
                <button
                  className="button"
                  type="submit"
                  disabled={!readyToActivate || pendingAction !== null}
                >
                  <Link2 size={16} />
                  {pendingAction === "activate"
                    ? editingConnectionId
                      ? "Salvando alteracoes..."
                      : "Validando estrutura..."
                    : editingConnectionId
                      ? "Salvar alteracoes"
                      : "Validar e ativar"}
                </button>
              </form>
            </section>
          </div>

          {notice ? (
            <div
              className={`meta-manual-notice ${notice.tone}`}
              role="status"
              aria-live="polite"
            >
              {notice.tone === "success" ? <CircleCheck size={16} /> : null}
              <span>{notice.message}</span>
            </div>
          ) : null}

          {setupMode === "advanced" ? renderConfiguredConnections(false) : null}
        </div>
      ) : null}
      {!setupOpen && notice ? (
        <div
          className={`meta-manual-notice ${notice.tone}`}
          role="status"
          aria-live="polite"
        >
          {notice.tone === "success" ? <CircleCheck size={16} /> : null}
          <span>{notice.message}</span>
        </div>
      ) : null}
      {!setupOpen ? renderConfiguredConnections(true) : null}

      <dialog
        className="meta-action-dialog meta-remove-connection-dialog"
        ref={removeDialogRef}
        onCancel={(event) => {
          if (pendingAction?.startsWith("remove:")) {
            event.preventDefault();
            return;
          }

          closeRemovalDialog();
        }}
      >
        <div className="meta-action-dialog-header">
          <div>
            <span className="micro-label">Remover estrutura Meta</span>
            <h3>{removingConnection?.businessManagerName ?? "Conexao"}</h3>
          </div>
          <button
            className="meta-dialog-close"
            type="button"
            aria-label="Fechar confirmacao"
            title="Fechar"
            onClick={closeRemovalDialog}
            disabled={pendingAction?.startsWith("remove:")}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <form className="meta-action-form" onSubmit={handleRemoveConnection}>
          <div className="meta-disconnect-warning">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>Esta BM deixara de sincronizar</strong>
              <p>
                As contas serao desativadas. Relatorios, eventos e auditorias
                historicos permanecem preservados.
              </p>
            </div>
          </div>
          <label className="field-label" htmlFor="meta-remove-confirmation">
            Digite o ID <strong>{removingConnection?.businessManagerId}</strong>
          </label>
          <input
            id="meta-remove-confirmation"
            autoComplete="off"
            value={removalConfirmation}
            onChange={(event) =>
              setRemovalConfirmation(event.currentTarget.value)
            }
            disabled={pendingAction?.startsWith("remove:")}
          />
          <div className="meta-action-dialog-footer">
            <button
              className="button"
              type="button"
              onClick={closeRemovalDialog}
              disabled={pendingAction?.startsWith("remove:")}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              type="submit"
              disabled={
                !removingConnection ||
                removalConfirmation.trim() !==
                  removingConnection.businessManagerId ||
                pendingAction !== null
              }
            >
              <Trash2 size={16} aria-hidden="true" />
              {pendingAction?.startsWith("remove:")
                ? "Removendo..."
                : "Remover estrutura"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function SetupStep({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <li className={`${active ? "active" : ""}${done ? " done" : ""}`}>
      <span>{done ? <Check size={12} /> : null}</span>
      {label}
    </li>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Ativa",
    pending: "Pendente",
    paused: "Pausada",
    validation_required: "Requer validacao",
    token_expired: "Token expirado",
    missing_permission: "Permissao ausente",
    destination_invalid: "Destino invalido",
    expired: "Expirado",
    revoked: "Revogado",
    error: "Erro",
  };

  return labels[status] ?? status;
}

function syncStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Aguardando",
    syncing: "Sincronizando",
    synced: "Sincronizada",
    error: "Falhou",
  };

  return labels[status] ?? status;
}

function accountSyncDetail(
  account: MetaManualConfigurationDto["reportingAccounts"][number],
) {
  if (account.syncError) {
    return account.syncError;
  }

  if (account.lastSyncSince && account.lastSyncUntil) {
    return `Periodo importado: ${account.lastSyncSince} a ${account.lastSyncUntil}`;
  }

  if (account.syncStatus === "syncing") {
    return "Importacao em andamento";
  }

  return "Aguardando a primeira importacao de Insights";
}
