import { describe, expect, it, vi } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailEnvelopeCryptoService } from "../src/email/email-envelope-crypto.service";
import { EmailQueueService } from "../src/email/email-queue.service";
import type { EmailQueueInput } from "../src/email/email.types";

function environment(provider = "smtp") {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    EMAIL_PROVIDER: provider,
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password-private",
    EMAIL_FROM_NAME: "WppTrack",
    EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
    EMAIL_REPLY_TO: "suporte@rastrack.app",
  };
}

const rawToken = "raw-action-token-that-must-remain-private-1234567890";
const input: EmailQueueInput = {
  workspaceId: "workspace-1",
  action: {
    type: "WorkspaceInvite",
    id: "invite-1",
    version: "rotation-2",
  },
  envelope: {
    to: { address: "membro@example.com", name: "Membro" },
    template: "workspace_invitation",
    data: {
      workspaceName: "Empresa Exemplo",
      inviterName: "Gestora",
      roleLabel: "Analista",
      token: rawToken,
      expiresAt: "2026-07-21T12:00:00.000Z",
    },
  },
};

describe("EmailQueueService", () => {
  it("queues only an encrypted envelope with deterministic retry settings", async () => {
    const queue = {
      add: vi.fn(async (_name, _payload, options) => ({ id: options.jobId })),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const configuration = new EmailConfigurationService(environment());
    const crypto = new EmailEnvelopeCryptoService(configuration);
    const service = new EmailQueueService(
      queue as never,
      configuration,
      crypto,
      audit as never,
    );

    const first = await service.enqueue(input);
    const second = await service.enqueue(input);
    const [, payload, options] = queue.add.mock.calls[0];
    const serializedJob = JSON.stringify(payload);
    const serializedAudit = JSON.stringify(audit.record.mock.calls);

    expect(first.deliveryId).toBe(second.deliveryId);
    expect(queue.add.mock.calls[0][2].jobId).toBe(
      queue.add.mock.calls[1][2].jobId,
    );
    expect(payload.workspaceId).toBe("workspace-1");
    expect(payload.template).toBe("workspace_invitation");
    expect(options).toMatchObject({
      attempts: 4,
      backoff: { type: "exponential", delay: 5_000 },
    });
    expect(serializedJob).not.toContain(rawToken);
    expect(serializedJob).not.toContain("membro@example.com");
    expect(serializedJob).not.toContain("Empresa Exemplo");
    expect(serializedJob).not.toContain("smtp-password-private");
    expect(serializedAudit).not.toContain(rawToken);
    expect(serializedAudit).not.toContain("membro@example.com");
    expect(crypto.decrypt(payload, payload)).toEqual(input.envelope);
  });

  it("refuses to queue while the provider is disabled", async () => {
    const queue = { add: vi.fn() };
    const audit = { record: vi.fn() };
    const configuration = new EmailConfigurationService(environment(""));
    const service = new EmailQueueService(
      queue as never,
      configuration,
      new EmailEnvelopeCryptoService(configuration),
      audit as never,
    );

    await expect(service.enqueue(input)).rejects.toThrow(
      "Transactional email provider is disabled",
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("keeps the queued result when delivery auditing is unavailable", async () => {
    const queue = {
      add: vi.fn(async (_name, _payload, options) => ({ id: options.jobId })),
    };
    const audit = {
      record: vi.fn(async () => {
        throw new Error("audit unavailable");
      }),
    };
    const configuration = new EmailConfigurationService(environment());
    const service = new EmailQueueService(
      queue as never,
      configuration,
      new EmailEnvelopeCryptoService(configuration),
      audit as never,
    );

    await expect(service.enqueue(input)).resolves.toMatchObject({
      status: "queued",
    });
  });
});
