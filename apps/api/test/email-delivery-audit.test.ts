import { describe, expect, it, vi } from "vitest";
import { EmailDeliveryAuditService } from "../src/email/email-delivery-audit.service";

describe("EmailDeliveryAuditService", () => {
  it("persists only redacted delivery metadata", async () => {
    const prisma = {
      auditLog: {
        create: vi.fn(async ({ data }) => data),
      },
    };
    const service = new EmailDeliveryAuditService(prisma as never);

    await service.record({
      deliveryId: "delivery-hash",
      workspaceId: "workspace-1",
      template: "workspace_invitation",
      recipientHash: "recipient-hash",
      status: "sent",
      attemptNumber: 1,
      maxAttempts: 4,
      providerMessageId: "provider-message-id",
    });

    const serialized = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(serialized).toContain("recipient-hash");
    expect(serialized).toContain("providerMessageIdHash");
    expect(serialized).not.toContain("provider-message-id");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("@example.com");
  });
});
