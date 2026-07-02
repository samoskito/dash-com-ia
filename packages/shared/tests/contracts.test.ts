import { describe, expect, it } from "vitest";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  campaignReportRowSchema,
  clientNavigation,
  conversionRuleCreateInputSchema,
  conversionRuleSchema,
  conversionRuleUpdateInputSchema,
  conversionTriggerEvaluationInputSchema,
  googleOAuthCallbackQuerySchema,
  googleOAuthCallbackResultSchema,
  googleOAuthStartSchema,
  googleOAuthStartResultSchema,
  emailVerificationConfirmInputSchema,
  emailVerificationConfirmSchema,
  emailVerificationStartSchema,
  currentWorkspaceSchema,
  diagnosticEventCreateSchema,
  diagnosticEventDetailSchema,
  diagnosticEventListQuerySchema,
  diagnosticRetryInputSchema,
  diagnosticRetryResultSchema,
  integrationHealthSchema,
  integrationHealthSummarySchema,
  metaOAuthCallbackQuerySchema,
  metaOAuthCallbackResultSchema,
  integrationStartActionSchema,
  loginSchema,
  passwordResetConfirmInputSchema,
  passwordResetConfirmSchema,
  passwordResetRequestInputSchema,
  passwordResetRequestSchema,
  registerSchema,
  splitReceiverCreateInputSchema,
  splitReceiverSchema,
  splitReceiverUpdateInputSchema,
  workspaceInviteInputSchema,
  workspaceBillingListSchema,
  workspaceBillingSchema,
  workspaceBillingUpdateInputSchema,
  workspaceInviteAcceptInputSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteSchema,
  workspaceMemberSchema,
  whatsappInstanceCheckoutInputSchema,
  whatsappInstanceCheckoutSchema,
  whatsappInstanceConnectionSchema,
  whatsappInstanceSummarySchema,
  whatsappInstanceQuoteSchema
} from "../src";

describe("shared contracts", () => {
  it("does not include Clientes in client navigation", () => {
    expect(clientNavigation.map((item) => item.label)).not.toContain("Clientes");
  });

  it("keeps owner/admin/member permission basics", () => {
    expect(canManageWorkspaceBilling("owner")).toBe(true);
    expect(canManageWorkspaceBilling("admin")).toBe(false);
    expect(canManageIntegrations("admin")).toBe(true);
    expect(canViewReports("member")).toBe(true);
  });

  it("validates campaign report rows", () => {
    const parsed = campaignReportRowSchema.parse({
      id: "cmp_1",
      name: "Black Friday WhatsApp",
      status: "active",
      spendCents: 120000,
      metaConversationsStarted: 100,
      costPerMetaConversationCents: 1200,
      realConversations: 80,
      costPerRealConversationCents: 1500,
      leadSubmitted: 30,
      costPerLeadSubmittedCents: 4000,
      qualifiedLead: 12,
      costPerQualifiedLeadCents: 10000,
      purchase: 3,
      costPerPurchaseCents: 40000,
      roas: 4.2
    });

    expect(parsed.purchase).toBe(3);
  });

  it("validates integration health payloads", () => {
    const parsed = integrationHealthSchema.parse({
      provider: "meta",
      status: "disconnected",
      checkedAt: "2026-07-01T21:30:00.000Z",
      message: "Missing credentials"
    });

    expect(parsed.provider).toBe("meta");
    expect(parsed.status).toBe("disconnected");
  });

  it("rejects invalid integration health payloads", () => {
    expect(() =>
      integrationHealthSchema.parse({
        provider: "stripe",
        status: "online",
        checkedAt: "not-a-date"
      })
    ).toThrow();
  });

  it("validates integration health summaries and start actions", () => {
    const summary = integrationHealthSummarySchema.parse({
      checkedAt: "2026-07-02T03:00:00.000Z",
      providers: [
        {
          provider: "meta",
          status: "disconnected",
          checkedAt: "2026-07-02T03:00:00.000Z",
          message: "Missing META_APP_ID or META_APP_SECRET"
        }
      ]
    });
    const action = integrationStartActionSchema.parse({
      provider: "meta",
      action: "configure_env",
      label: "Configurar app Meta",
      missingEnv: ["META_APP_ID", "META_APP_SECRET"]
    });

    expect(summary.providers[0]?.provider).toBe("meta");
    expect(action.missingEnv).toEqual(["META_APP_ID", "META_APP_SECRET"]);
  });

  it("validates login payloads and normalizes email", () => {
    const parsed = loginSchema.parse({
      email: "  OWNER@WPPTRACK.COM  ",
      password: "secret123"
    });

    expect(parsed).toEqual({
      email: "owner@wpptrack.com",
      password: "secret123"
    });
  });

  it("rejects short login passwords", () => {
    expect(() =>
      loginSchema.parse({
        email: "owner@wpptrack.com",
        password: "short"
      })
    ).toThrow();
  });

  it("validates register payloads", () => {
    const parsed = registerSchema.parse({
      name: "Samuel",
      email: "SAMUEL@WPPTRACK.COM",
      password: "strong-password",
      workspaceName: "WppTrack"
    });

    expect(parsed.email).toBe("samuel@wpptrack.com");
    expect(parsed.workspaceName).toBe("WppTrack");
  });

  it("rejects register payloads without a workspace name", () => {
    expect(() =>
      registerSchema.parse({
        name: "S",
        email: "samuel@wpptrack.com",
        password: "strong-password"
      })
    ).toThrow();
  });

  it("validates google oauth start payloads without requiring oauth wiring", () => {
    const parsed = googleOAuthStartSchema.parse({
      redirectTo: "/dashboard"
    });
    const result = googleOAuthStartResultSchema.parse({
      provider: "google",
      action: "redirect",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
      missingEnv: [],
      state: "state-token"
    });

    expect(parsed.redirectTo).toBe("/dashboard");
    expect(result.action).toBe("redirect");
  });

  it("validates google oauth callback scaffolding payloads", () => {
    const query = googleOAuthCallbackQuerySchema.parse({
      code: "oauth-code",
      state: "state-token"
    });
    const result = googleOAuthCallbackResultSchema.parse({
      provider: "google",
      action: "exchange_pending",
      missingEnv: [],
      codeReceived: true,
      redirectTo: "/overview"
    });

    expect(query.code).toBe("oauth-code");
    expect(result.action).toBe("exchange_pending");
  });

  it("validates Meta OAuth callback and sanitized exchange result payloads", () => {
    const query = metaOAuthCallbackQuerySchema.parse({
      code: "meta-code",
      state: "workspace-state"
    });
    const result = metaOAuthCallbackResultSchema.parse({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read", "business_management"],
      message: "Meta OAuth conectado"
    });

    expect(query.code).toBe("meta-code");
    expect(result.status).toBe("connected");
    expect("accessToken" in result).toBe(false);
  });

  it("validates password reset and email verification contracts", () => {
    const resetRequest = passwordResetRequestInputSchema.parse({
      email: " USER@WPPTRACK.COM "
    });
    const resetResult = passwordResetRequestSchema.parse({
      ok: true,
      delivery: "not_configured",
      devToken: "reset-token-1234567890"
    });
    const resetConfirm = passwordResetConfirmInputSchema.parse({
      token: "reset-token-1234567890",
      password: "new-strong-password"
    });
    const resetConfirmed = passwordResetConfirmSchema.parse({ ok: true });
    const verificationStart = emailVerificationStartSchema.parse({
      ok: true,
      delivery: "not_configured",
      devToken: null
    });
    const verificationConfirm = emailVerificationConfirmInputSchema.parse({
      token: "verify-token-1234567890"
    });
    const verified = emailVerificationConfirmSchema.parse({
      ok: true,
      emailVerifiedAt: "2026-07-02T03:00:00.000Z"
    });

    expect(resetRequest.email).toBe("user@wpptrack.com");
    expect(resetResult.devToken).toBe("reset-token-1234567890");
    expect(resetConfirm.password).toBe("new-strong-password");
    expect(resetConfirmed.ok).toBe(true);
    expect(verificationStart.ok).toBe(true);
    expect(verificationConfirm.token).toBe("verify-token-1234567890");
    expect(verified.ok).toBe(true);
  });

  it("validates current workspace, members and invites", () => {
    const workspace = currentWorkspaceSchema.parse({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner",
      permissions: {
        canInviteMembers: true,
        canManageBilling: true,
        canManageIntegrations: true,
        canViewReports: true
      }
    });
    const member = workspaceMemberSchema.parse({
      id: "member_1",
      userId: "user_1",
      email: "owner@wpptrack.com",
      name: "Owner",
      role: "owner",
      joinedAt: "2026-07-02T03:00:00.000Z"
    });
    const inviteInput = workspaceInviteInputSchema.parse({
      email: " ADMIN@WPPTRACK.COM ",
      role: "admin"
    });
    const invite = workspaceInviteSchema.parse({
      id: "invite_1",
      email: "admin@wpptrack.com",
      role: "admin",
      status: "pending",
      expiresAt: "2026-07-09T03:00:00.000Z",
      acceptToken: "invite-token-1234567890"
    });
    const acceptInput = workspaceInviteAcceptInputSchema.parse({
      token: "invite-token-1234567890"
    });
    const accepted = workspaceInviteAcceptSchema.parse({
      workspaceId: "workspace_1",
      memberId: "member_2",
      role: "admin",
      status: "accepted"
    });

    expect(workspace.permissions.canManageBilling).toBe(true);
    expect(member.role).toBe("owner");
    expect(inviteInput.email).toBe("admin@wpptrack.com");
    expect(invite.status).toBe("pending");
    expect(invite.acceptToken).toBe("invite-token-1234567890");
    expect(acceptInput.token).toBe("invite-token-1234567890");
    expect(accepted.memberId).toBe("member_2");
  });

  it("validates workspace billing configuration for platform backoffice", () => {
    const input = workspaceBillingUpdateInputSchema.parse({
      asaasCustomerId: "cus_asaas_1"
    });
    const cleared = workspaceBillingUpdateInputSchema.parse({
      asaasCustomerId: null
    });
    const billing = workspaceBillingSchema.parse({
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      asaasCustomerId: "cus_asaas_1"
    });

    expect(input.asaasCustomerId).toBe("cus_asaas_1");
    expect(cleared.asaasCustomerId).toBeNull();
    expect(billing.asaasCustomerId).toBe("cus_asaas_1");
  });

  it("validates workspace billing list for platform backoffice", () => {
    const workspaces = workspaceBillingListSchema.parse([
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: "cus_asaas_1"
      },
      {
        id: "workspace_2",
        name: "Clinica Norte",
        slug: "clinica-norte",
        asaasCustomerId: null
      }
    ]);

    expect(workspaces).toHaveLength(2);
    expect(workspaces[1]?.asaasCustomerId).toBeNull();
  });

  it("rejects owner invites from client-facing workspace API", () => {
    expect(() =>
      workspaceInviteInputSchema.parse({
        email: "owner2@wpptrack.com",
        role: "owner"
      })
    ).toThrow();
  });

  it("validates diagnostic event contracts", () => {
    const create = diagnosticEventCreateSchema.parse({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      status: "error",
      severity: "error",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      summaryPayload: {
        authorization: "secret-token",
        currency: null
      }
    });
    const query = diagnosticEventListQuerySchema.parse({
      source: "meta",
      limit: "25"
    });
    const detail = diagnosticEventDetailSchema.parse({
      id: "diag_1",
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      occurredAt: "2026-07-02T03:00:00.000Z",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      leadId: null,
      phoneHash: null,
      campaignId: null,
      adSetId: null,
      adId: null,
      jobId: null,
      errorCode: "MISSING_CURRENCY",
      summaryPayload: {
        currency: null
      }
    });

    expect(create.source).toBe("meta");
    expect(query.limit).toBe(25);
    expect(detail.errorCode).toBe("MISSING_CURRENCY");
  });

  it("validates diagnostic retry contracts", () => {
    const input = diagnosticRetryInputSchema.parse({
      reason: "Cliente relatou conversao faltando no relatorio"
    });
    const result = diagnosticRetryResultSchema.parse({
      ok: true,
      status: "queued",
      diagnosticEventId: "diag_1",
      auditLogId: "audit_1",
      jobAttemptId: "job_attempt_1"
    });

    expect(input.reason).toContain("conversao");
    expect(result.status).toBe("queued");
  });

  it("validates billing quote and checkout contracts", () => {
    const quote = whatsappInstanceQuoteSchema.parse({
      workspaceId: "workspace_1",
      activeInstances: 1,
      pricePerInstanceCents: 9900,
      nextInstanceAmountCents: 9900,
      currency: "BRL"
    });
    const input = whatsappInstanceCheckoutInputSchema.parse({
      instanceName: "Comercial",
      provider: "uazapi"
    });
    const checkout = whatsappInstanceCheckoutSchema.parse({
      workspaceId: "workspace_1",
      whatsappInstanceId: "wpp_1",
      activationId: "activation_1",
      chargeId: "charge_1",
      status: "pending_payment",
      amountCents: 9900,
      checkoutUrl: null,
      paymentProvider: "asaas",
      paymentProviderStatus: "not_configured",
      externalChargeId: null
    });

    expect(quote.currency).toBe("BRL");
    expect(input.provider).toBe("uazapi");
    expect(checkout.status).toBe("pending_payment");
    expect(checkout.paymentProviderStatus).toBe("not_configured");
  });

  it("validates whatsapp instance connection status contracts", () => {
    const connection = whatsappInstanceConnectionSchema.parse({
      whatsappInstanceId: "wpp_1",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "qr_required",
      qrCode: "base64-or-text-qr",
      message: "Escaneie o QR Code no WhatsApp Business"
    });

    expect(connection.provider).toBe("uazapi");
    expect(connection.qrCode).toBe("base64-or-text-qr");
  });

  it("validates whatsapp instance summary contracts", () => {
    const instance = whatsappInstanceSummarySchema.parse({
      id: "wpp_1",
      name: "Comercial",
      provider: "uazapi",
      billingStatus: "active",
      providerInstanceId: "provider_instance_1",
      createdAt: "2026-07-02T03:00:00.000Z"
    });

    expect(instance.billingStatus).toBe("active");
    expect(instance.providerInstanceId).toBe("provider_instance_1");
  });

  it("validates split receiver contracts for platform backoffice", () => {
    const create = splitReceiverCreateInputSchema.parse({
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500
    });
    const update = splitReceiverUpdateInputSchema.parse({
      active: false,
      percentageBps: 1500
    });
    const receiver = splitReceiverSchema.parse({
      id: "receiver_1",
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    });

    expect(create.percentageBps).toBe(2500);
    expect(update.active).toBe(false);
    expect(receiver.walletId).toBe("wallet_asaas_1");
  });

  it("validates conversion rule contracts for keyword and WhatsApp labels", () => {
    const create = conversionRuleCreateInputSchema.parse({
      name: "Lead qualificado por palavra",
      triggerType: "keyword",
      triggerValue: "quero comprar",
      matchMode: "contains",
      eventName: "QualifiedLead",
      pixelId: "1234567890"
    });
    const update = conversionRuleUpdateInputSchema.parse({
      active: false,
      triggerValue: "VIP"
    });
    const rule = conversionRuleSchema.parse({
      id: "rule_1",
      workspaceId: "workspace_1",
      name: "Compra por etiqueta",
      triggerType: "whatsapp_label",
      triggerValue: "Venda fechada",
      matchMode: "exact",
      eventName: "Purchase",
      pixelId: null,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    });
    const evaluation = conversionTriggerEvaluationInputSchema.parse({
      messageText: "Oi, quero comprar agora",
      labels: ["Venda fechada"]
    });

    expect(create.eventName).toBe("QualifiedLead");
    expect(update.active).toBe(false);
    expect(rule.triggerType).toBe("whatsapp_label");
    expect(evaluation.labels).toEqual(["Venda fechada"]);
  });
});
