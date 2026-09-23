export const EMAIL_DELIVERY_QUEUE = "transactional-email";

export const transactionalEmailTemplateNames = [
  "workspace_invitation",
  "password_reset",
  "email_verification",
  "client_owner_activation",
  "workspace_access_granted",
  "license_key_delivery",
  "license_claim_code",
  "billing_trial_reminder",
] as const;

export type TransactionalEmailTemplateName =
  (typeof transactionalEmailTemplateNames)[number];

export type EmailRecipient = {
  address: string;
  name?: string;
};

export type WorkspaceInvitationEmailData = {
  workspaceName: string;
  inviterName?: string;
  roleLabel: string;
  token: string;
  expiresAt: string;
};

export type PasswordResetEmailData = {
  recipientName?: string;
  token: string;
  expiresAt: string;
};

export type EmailVerificationData = {
  recipientName?: string;
  token: string;
  expiresAt: string;
};

export type ClientOwnerActivationEmailData = {
  recipientName?: string;
  workspaceName: string;
  token: string;
  expiresAt: string;
};

export type WorkspaceAccessGrantedEmailData = {
  recipientName?: string;
  workspaceName: string;
};

/** raw key only ever travels inside the encrypted envelope / rendered email body. */
export type LicenseKeyDeliveryEmailData = {
  recipientName?: string;
  licenseKey: string;
  keyPrefix: string;
  expiresAt: string;
  productName: string;
  repoUrl: string;
  supportEmail?: string;
};

export type LicenseClaimCodeEmailData = {
  code: string;
  expiresAt: string;
  productName: string;
  supportEmail?: string;
};

export type BillingTrialReminderEmailData = {
  recipientName?: string;
  emailSubject: string;
  body: string;
  subscriptionUrl: string;
};

export type TransactionalEmailEnvelope =
  | {
      to: EmailRecipient;
      template: "workspace_invitation";
      data: WorkspaceInvitationEmailData;
    }
  | {
      to: EmailRecipient;
      template: "password_reset";
      data: PasswordResetEmailData;
    }
  | {
      to: EmailRecipient;
      template: "email_verification";
      data: EmailVerificationData;
    }
  | {
      to: EmailRecipient;
      template: "client_owner_activation";
      data: ClientOwnerActivationEmailData;
    }
  | {
      to: EmailRecipient;
      template: "workspace_access_granted";
      data: WorkspaceAccessGrantedEmailData;
    }
  | {
      to: EmailRecipient;
      template: "license_key_delivery";
      data: LicenseKeyDeliveryEmailData;
    }
  | {
      to: EmailRecipient;
      template: "license_claim_code";
      data: LicenseClaimCodeEmailData;
    }
  | {
      to: EmailRecipient;
      template: "billing_trial_reminder";
      data: BillingTrialReminderEmailData;
    };

export type EmailActionReference = {
  type:
    | "WorkspaceInvite"
    | "WorkspaceMember"
    | "AuthActionToken"
    | "License"
    | "LicenseClaim"
    | "BillingTrialReminder";
  id: string;
  version: string;
};

export type EncryptedEmailEnvelope = {
  encryptionVersion: 1;
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type EmailEnvelopeContext = {
  deliveryId: string;
  workspaceId: string | null;
  template: TransactionalEmailTemplateName;
  recipientHash: string;
  actionType: EmailActionReference["type"];
  actionId: string;
  actionVersion: string;
};

export type EmailDeliveryJobPayload = EncryptedEmailEnvelope &
  EmailEnvelopeContext;

export type RenderedEmailMessage = {
  from: EmailRecipient;
  replyTo: string;
  to: EmailRecipient;
  subject: string;
  text: string;
  html: string;
};

export type EmailQueueInput = {
  workspaceId: string | null;
  action: EmailActionReference;
  envelope: TransactionalEmailEnvelope;
};

export type EmailQueueResult = {
  deliveryId: string;
  jobId: string | number | undefined;
  status: "queued";
};

export type EmailDeliveryAuditStatus =
  "queued" | "retrying" | "sent" | "failed";
