import { describe, expect, it } from "vitest";
import {
  adReportOverviewSchema,
  adSetReportOverviewSchema,
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
  diagnosticWebhookPayloadSchema,
  integrationHealthSchema,
  integrationHealthSummarySchema,
  integrationPipelineOverviewSchema,
  metaCapiTokenInputSchema,
  metaCapiTokenStatusSchema,
  metaAssetSelectionInputSchema,
  metaAssetsSchema,
  metaStructureReportSchema,
  leadListItemSchema,
  leadDetailSchema,
  leadListQuerySchema,
  metaConnectionSchema,
  metaOAuthCallbackQuerySchema,
  metaOAuthCallbackResultSchema,
  integrationStartActionSchema,
  loginSchema,
  passwordResetConfirmInputSchema,
  passwordResetConfirmSchema,
  passwordResetRequestInputSchema,
  passwordResetRequestSchema,
  registerSchema,
  backofficePaymentChargeListSchema,
  backofficePaymentChargeSchema,
  backofficeSubscriptionPlanCreateInputSchema,
  backofficeSubscriptionPlanSchema,
  backofficeSubscriptionPlanUpdateInputSchema,
  splitReceiverCreateInputSchema,
  splitReceiverSchema,
  splitReceiverUpdateInputSchema,
  workspaceInviteInputSchema,
  workspaceUpdateInputSchema,
  workspaceBillingListSchema,
  workspaceBillingSchema,
  workspaceOperationalStatusUpdateInputSchema,
  workspaceBillingUpdateInputSchema,
  workspaceInviteAcceptInputSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteSchema,
  workspaceMemberSchema,
  workspaceSubscriptionSummarySchema,
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

  it("validates ad set and ad performance report overviews", () => {
    const adSets = adSetReportOverviewSchema.parse({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      adSets: [
        {
          id: "adset_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          name: "Publico quente",
          status: "active",
          spendCents: 0,
          metaConversationsStarted: 0,
          costPerMetaConversationCents: null,
          realConversations: 2,
          costPerRealConversationCents: null,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: null,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: null,
          purchase: 1,
          costPerPurchaseCents: null,
          roas: null
        }
      ]
    });
    const ads = adReportOverviewSchema.parse({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      ads: [
        {
          id: "ad_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          adSetId: "adset_1",
          adSetName: "Publico quente",
          name: "Criativo WhatsApp",
          status: "active",
          spendCents: 0,
          metaConversationsStarted: 0,
          costPerMetaConversationCents: null,
          realConversations: 2,
          costPerRealConversationCents: null,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: null,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: null,
          purchase: 1,
          costPerPurchaseCents: null,
          roas: null
        }
      ]
    });

    expect(adSets.adSets[0]?.campaignName).toBe("Black Friday WhatsApp");
    expect(ads.ads[0]?.adSetName).toBe("Publico quente");
  });

  it("validates Meta campaign/adset/ad structure reports", () => {
    const parsed = metaStructureReportSchema.parse({
      workspaceId: "workspace_1",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "ACTIVE",
          effectiveStatus: "ACTIVE",
          objective: "OUTCOME_SALES",
          adSets: [
            {
              id: "adset_1",
              name: "Publico quente",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
              ads: [
                {
                  id: "ad_1",
                  name: "Criativo WhatsApp",
                  status: "ACTIVE",
                  effectiveStatus: "ACTIVE"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(parsed.campaigns[0]?.adSets[0]?.ads[0]?.name).toBe(
      "Criativo WhatsApp"
    );
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

  it("validates integration pipeline overview contracts", () => {
    const overview = integrationPipelineOverviewSchema.parse({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      stages: [
        {
          key: "webhook",
          label: "Webhook",
          value: 12,
          detail: "Webhooks Uazapi recebidos"
        },
        {
          key: "meta_sent",
          label: "Meta ACK",
          value: 7,
          detail: "Eventos enviados para Meta"
        }
      ]
    });

    expect(overview.stages[0]?.value).toBe(12);
    expect(overview.stages[1]?.key).toBe("meta_sent");
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

  it("validates completed google oauth callback payloads", () => {
    const result = googleOAuthCallbackResultSchema.parse({
      provider: "google",
      action: "authenticated",
      missingEnv: [],
      codeReceived: true,
      redirectTo: "/overview"
    });

    expect(result.action).toBe("authenticated");
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

  it("validates Meta connection status payloads without exposing tokens", () => {
    const connection = metaConnectionSchema.parse({
      workspaceId: "workspace_1",
      status: "connected",
      tokenType: "bearer",
      scopes: ["ads_read", "business_management"],
      expiresAt: "2026-09-01T03:00:00.000Z",
      connectedAt: "2026-07-02T03:00:00.000Z",
      selectedBusinessId: null,
      selectedAdAccountId: null,
      selectedPixelId: "pixel_1"
    });

    expect(connection.status).toBe("connected");
    expect(JSON.stringify(connection)).not.toContain("accessToken");
  });

  it("validates Meta assets and selected BM/account/pixel payloads", () => {
    const assets = metaAssetsSchema.parse({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        }
      ],
      adAccounts: [
        {
          id: "act_123",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        }
      ],
      pixels: [
        {
          id: "pixel_1",
          name: "Pixel Loja",
          code: "1234567890"
        }
      ],
      selection: {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1"
      },
      lastSyncedAt: "2026-07-02T12:00:00.000Z",
      syncError: null
    });
    const input = metaAssetSelectionInputSchema.parse({
      businessId: "business_1",
      adAccountId: "act_123",
      pixelId: "pixel_1"
    });

    expect(assets.businesses[0]?.name).toBe("BM Principal");
    expect(assets.adAccounts[0]?.currency).toBe("BRL");
    expect(assets.pixels[0]?.name).toBe("Pixel Loja");
    expect(input.pixelId).toBe("pixel_1");
    expect(JSON.stringify(assets)).not.toContain("accessToken");
  });

  it("validates Meta CAPI token configuration contracts without echoing secrets", () => {
    const saveInput = metaCapiTokenInputSchema.parse({
      accessToken: "EAAB-capi-token-secret"
    });
    const clearInput = metaCapiTokenInputSchema.parse({
      clear: true
    });
    const status = metaCapiTokenStatusSchema.parse({
      workspaceId: "workspace_1",
      configured: true,
      updatedAt: "2026-07-02T03:00:00.000Z"
    });

    expect(saveInput.accessToken).toBe("EAAB-capi-token-secret");
    expect(clearInput.clear).toBe(true);
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("EAAB-capi-token-secret");
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
      operationalStatus: "blocked",
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
    expect(workspace.operationalStatus).toBe("blocked");
    expect(member.role).toBe("owner");
    expect(inviteInput.email).toBe("admin@wpptrack.com");
    expect(invite.status).toBe("pending");
    expect(invite.acceptToken).toBe("invite-token-1234567890");
    expect(acceptInput.token).toBe("invite-token-1234567890");
    expect(accepted.memberId).toBe("member_2");
  });

  it("validates workspace update input", () => {
    const input = workspaceUpdateInputSchema.parse({
      name: " Loja Samuel "
    });

    expect(input.name).toBe("Loja Samuel");
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
      asaasCustomerId: "cus_asaas_1",
      operationalStatus: "active",
      subscriptionStatus: "active",
      activeInstances: 2
    });
    const statusInput = workspaceOperationalStatusUpdateInputSchema.parse({
      operationalStatus: "blocked"
    });

    expect(input.asaasCustomerId).toBe("cus_asaas_1");
    expect(cleared.asaasCustomerId).toBeNull();
    expect(billing.asaasCustomerId).toBe("cus_asaas_1");
    expect(billing.operationalStatus).toBe("active");
    expect(statusInput.operationalStatus).toBe("blocked");
    expect(billing.subscriptionStatus).toBe("active");
    expect(billing.activeInstances).toBe(2);
  });

  it("validates workspace billing list for platform backoffice", () => {
    const workspaces = workspaceBillingListSchema.parse([
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        asaasCustomerId: "cus_asaas_1",
        operationalStatus: "active",
        subscriptionStatus: "active",
        activeInstances: 1
      },
      {
        id: "workspace_2",
        name: "Clinica Norte",
        slug: "clinica-norte",
        asaasCustomerId: null,
        operationalStatus: "blocked",
        subscriptionStatus: "not_configured",
        activeInstances: 0
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
      q: "currency",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      errorCode: "MISSING_CURRENCY",
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
      },
      timeline: [
        {
          id: "diag_1",
          kind: "diagnostic_event",
          label: "Meta recusou evento",
          status: "error",
          occurredAt: "2026-07-02T03:00:00.000Z",
          summaryPayload: {
            currency: null
          }
        },
        {
          id: "job_attempt_1",
          kind: "job_attempt",
          label: "retry-diagnostic-event",
          status: "queued",
          occurredAt: "2026-07-02T03:01:00.000Z",
          summaryPayload: null
        }
      ]
    });

    expect(create.source).toBe("meta");
    expect(query).toMatchObject({
      source: "meta",
      q: "currency",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      errorCode: "MISSING_CURRENCY",
      limit: 25
    });
    expect(detail.errorCode).toBe("MISSING_CURRENCY");
    expect(detail.timeline[1]?.kind).toBe("job_attempt");
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

  it("validates diagnostic webhook payload contract", () => {
    const payload = diagnosticWebhookPayloadSchema.parse({
      id: "webhook_1",
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      status: "received",
      receivedAt: "2026-07-02T03:00:00.000Z",
      payloadKind: "summary",
      payloadAvailable: true,
      payload: {
        message: {
          text: "Venda fechada",
          token: "[redacted]"
        }
      }
    });

    expect(payload.payloadKind).toBe("summary");
    expect(payload.payloadAvailable).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("secret-token");
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

  it("validates workspace subscription summary contract", () => {
    const subscription = workspaceSubscriptionSummarySchema.parse({
      workspaceId: "workspace_1",
      status: "active",
      planName: "Por instancia",
      activeInstances: 3,
      pricePerWhatsappInstanceCents: 9900,
      monthlyAmountCents: 29700,
      currentPeriodEnd: "2026-08-02T03:00:00.000Z",
      asaasSubscriptionId: "sub_asaas_1"
    });

    expect(subscription.monthlyAmountCents).toBe(29700);
  });

  it("validates lead list contracts", () => {
    const query = leadListQuerySchema.parse({
      search: "  mariana  ",
      status: "qualified",
      label: " Venda fechada ",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      since: "2026-07-01",
      until: "2026-07-02",
      limit: "25"
    });
    const lead = leadListItemSchema.parse({
      id: "lead_1",
      workspaceId: "workspace_1",
      name: "Mariana Alves",
      phoneDisplay: "+55 11 *****-1020",
      phoneHash: "phone_hash_1",
      status: "qualified",
      source: "uazapi",
      labels: ["Venda fechada", "VIP"],
      campaignId: "cmp_1",
      campaignName: "Black Friday WhatsApp",
      adSetId: "adset_1",
      adId: "ad_1",
      lastEventName: "QualifiedLead",
      score: 86,
      firstMessageAt: "2026-07-02T03:00:00.000Z",
      lastMessageAt: "2026-07-02T03:10:00.000Z",
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:10:00.000Z"
    });

    expect(query).toMatchObject({
      search: "mariana",
      status: "qualified",
      label: "Venda fechada",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      since: "2026-07-01",
      until: "2026-07-02",
      limit: 25
    });
    expect(lead.lastEventName).toBe("QualifiedLead");
    expect(lead.labels).toEqual(["Venda fechada", "VIP"]);
  });

  it("validates lead detail contracts with conversion and webhook timeline", () => {
    const detail = leadDetailSchema.parse({
      lead: {
        id: "lead_1",
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phoneDisplay: "+55 11 *****-1020",
        phoneHash: "phone_hash_1",
        status: "qualified",
        source: "uazapi",
        labels: ["Venda fechada"],
        campaignId: "cmp_1",
        campaignName: "Black Friday WhatsApp",
        adSetId: "adset_1",
        adId: "ad_1",
        lastEventName: "QualifiedLead",
        score: 86,
        firstMessageAt: "2026-07-02T03:00:00.000Z",
        lastMessageAt: "2026-07-02T03:10:00.000Z",
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:10:00.000Z"
      },
      attribution: {
        campaignName: "Black Friday WhatsApp",
        adSetName: "Publico quente",
        adName: "Criativo WhatsApp"
      },
      conversionEvents: [
        {
          id: "conversion_1",
          eventName: "QualifiedLead",
          status: "sent",
          sourceTrigger: "keyword",
          pixelId: "pixel_1",
          campaignId: "cmp_1",
          adSetId: "adset_1",
          adId: "ad_1",
          errorCode: null,
          errorMessage: null,
          sentAt: "2026-07-02T03:13:00.000Z",
          createdAt: "2026-07-02T03:12:00.000Z"
        }
      ],
      webhookEvents: [
        {
          id: "webhook_1",
          source: "uazapi",
          eventType: "message",
          status: "processed",
          errorCode: null,
          errorMessage: null,
          receivedAt: "2026-07-02T03:01:00.000Z",
          processedAt: "2026-07-02T03:01:01.000Z"
        }
      ]
    });

    expect(detail.attribution.adName).toBe("Criativo WhatsApp");
    expect(detail.conversionEvents[0]?.status).toBe("sent");
    expect(detail.webhookEvents[0]?.source).toBe("uazapi");
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
      checkoutUrl: null,
      createdAt: "2026-07-02T03:00:00.000Z"
    });

    expect(instance.billingStatus).toBe("active");
    expect(instance.providerInstanceId).toBe("provider_instance_1");
    expect(instance.checkoutUrl).toBeNull();
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

  it("validates backoffice payment charge contracts", () => {
    const charge = backofficePaymentChargeSchema.parse({
      id: "charge_1",
      workspaceId: "workspace_1",
      workspaceName: "Comunidade NOD",
      provider: "asaas",
      externalChargeId: "pay_asaas_1",
      status: "paid",
      amountCents: 12900,
      description: "Ativacao da instancia WhatsApp Comercial",
      checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1",
      dueAt: null,
      paidAt: "2026-07-02T12:00:00.000Z",
      createdAt: "2026-07-02T11:00:00.000Z",
      whatsappInstanceId: "wpp_1",
      whatsappInstanceName: "Comercial"
    });
    const charges = backofficePaymentChargeListSchema.parse([charge]);

    expect(charges[0]?.status).toBe("paid");
    expect(charges[0]?.amountCents).toBe(12900);
    expect(charges[0]?.workspaceName).toBe("Comunidade NOD");
  });

  it("validates backoffice subscription plan contracts", () => {
    const create = backofficeSubscriptionPlanCreateInputSchema.parse({
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 12900,
      active: true
    });
    const update = backofficeSubscriptionPlanUpdateInputSchema.parse({
      pricePerWhatsappInstanceCents: 14900,
      active: false
    });
    const plan = backofficeSubscriptionPlanSchema.parse({
      id: "plan_1",
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 12900,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    });

    expect(create.slug).toBe("growth");
    expect(update.active).toBe(false);
    expect(plan.pricePerWhatsappInstanceCents).toBe(12900);
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
