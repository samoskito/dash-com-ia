import { beforeEach, describe, expect, it, vi } from "vitest";
import { UazapiConversionBridgeService } from "../src/inbound-webhooks/uazapi-conversion-bridge.service";

describe("UazapiConversionBridgeService", () => {
  const prisma = {
    inboundWebhookChannel: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const service = new UazapiConversionBridgeService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing bridge when the channel is already linked", async () => {
    prisma.inboundWebhookChannel.findUnique.mockResolvedValue({
      id: "channel_1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    });

    await expect(
      service.ensureBridge({
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD Bento",
        providerInstanceId: "prov_1",
      }),
    ).resolves.toEqual({
      connectionId: "connection_1",
      channelId: "channel_1",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not reuse a bridge from another workspace", async () => {
    prisma.inboundWebhookChannel.findUnique.mockResolvedValue({
      id: "channel_x",
      connectionId: "connection_x",
      workspaceId: "other_workspace",
    });
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        inboundWebhookChannel: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "channel_new" }),
        },
        inboundWebhookParserRelease: {
          upsert: vi.fn().mockResolvedValue({ id: "release_1" }),
        },
        inboundWebhookConnection: {
          create: vi.fn().mockResolvedValue({ id: "connection_new" }),
        },
      }),
    );

    await expect(
      service.ensureBridge({
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD Bento",
        providerInstanceId: "prov_1",
      }),
    ).resolves.toEqual({
      connectionId: "connection_new",
      channelId: "channel_new",
    });
  });
});
