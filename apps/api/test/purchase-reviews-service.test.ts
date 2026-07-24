import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PurchaseReviewsService } from "../src/inbound-webhook-production/purchase-reviews.service";

function createService() {
  const purchaseReview = {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  const prisma = { purchaseReview } as unknown as PrismaService;
  const canonicalApproval = {
    prepareApproval: vi.fn(async () => null),
  };

  return {
    purchaseReview,
    canonicalApproval,
    service: new PurchaseReviewsService(
      prisma,
      canonicalApproval as never,
    ),
  };
}

describe("purchase reviews service", () => {
  it("paginates only actionable reviews in the default operational queue", async () => {
    const { purchaseReview, service } = createService();

    await service.list("workspace_1", {
      view: "actionable",
      page: 1,
      pageSize: 25,
    });

    expect(purchaseReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          AND: [
            {
              OR: [
                { reasonCode: null },
                {
                  reasonCode: {
                    notIn: ["empty_template_ignored", "ignored_untracked_lead"],
                  },
                },
              ],
            },
          ],
          status: {
            in: ["review_required"],
          },
        }),
      }),
    );
  });

  it("keeps terminal purchases available in the history view", async () => {
    const { purchaseReview, service } = createService();

    await service.list("workspace_1", {
      view: "history",
      page: 1,
      pageSize: 25,
    });

    expect(purchaseReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { reasonCode: null },
                {
                  reasonCode: {
                    notIn: ["empty_template_ignored", "ignored_untracked_lead"],
                  },
                },
              ],
            },
          ],
          status: {
            in: [
              "approved",
              "sent",
              "duplicate",
              "rejected",
              "failed",
              "corrected_after_send",
            ],
          },
        }),
      }),
    );
  });

  it("lets an explicit status override the selected view", async () => {
    const { purchaseReview, service } = createService();

    await service.list("workspace_1", {
      view: "actionable",
      status: "sent",
      page: 1,
      pageSize: 25,
    });

    expect(purchaseReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "sent" }),
      }),
    );
  });

  it("keeps technical failures out of the actionable counter", async () => {
    const { purchaseReview, service } = createService();

    await service.list("workspace_1", {
      view: "history",
      status: "failed",
      page: 1,
      pageSize: 25,
    });

    expect(purchaseReview.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        workspaceId: "workspace_1",
        status: { in: ["review_required"] },
      }),
    });
  });
});
