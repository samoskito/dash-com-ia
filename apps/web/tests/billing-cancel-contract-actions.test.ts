import { afterEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, serverApiFetch } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  serverApiFetch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({ serverApiFetch }));

import { cancelPackageContractAction } from "../src/app/(backoffice)/backoffice/billing/actions";
import { initialBackofficeActionState } from "../src/components/backoffice-action-form";

afterEach(() => {
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("backoffice cancel package contract action", () => {
  it("ends the contract and refreshes the billing table", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    const result = await cancelPackageContractAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        reason: "contrato duplicado do Fabricio",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/package-contracts/workspace_1/subscriptions/contract_1/cancel",
      {
        method: "POST",
        body: JSON.stringify({ reason: "contrato duplicado do Fabricio" }),
      },
    );
    expect(result).toEqual({
      status: "success",
      message: "Contrato encerrado e retirado da lista.",
      nonce: expect.any(Number),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/billing");
  });

  it("falls back to the default reason when the field is left empty", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    const result = await cancelPackageContractAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        reason: "   ",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ reason: "encerrar contrato antigo" }),
      }),
    );
    expect(result.status).toBe("success");
  });

  it("escapes identifiers before building the cancel path", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    await cancelPackageContractAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace/1",
        subscriptionId: "contract 1",
        reason: "limpeza",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/package-contracts/workspace%2F1/subscriptions/contract%201/cancel",
      expect.any(Object),
    );
  });

  it("keeps the row and surfaces the API message when the cancel fails", async () => {
    serverApiFetch.mockRejectedValueOnce(
      new Error("Contrato atual nao pode ser encerrado"),
    );

    const result = await cancelPackageContractAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        reason: "limpeza",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Contrato atual nao pode ser encerrado",
      nonce: expect.any(Number),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
