export const EMAIL_DELIVERY_QUEUE = "transactional-email";

export const transactionalEmailTemplateNames = [
  "workspace_invitation",
  "password_reset",
  "email_verification",
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
    };

export type EmailActionReference = {
  type: "WorkspaceInvite" | "AuthActionToken";
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
