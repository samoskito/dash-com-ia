import { afterEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, serverApiFetch } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  serverApiFetch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({ serverApiFetch }));

import {
  disableTrialAutoconvertAction,
  startWorkspaceTrialAction,
} from "../src/app/(backoffice)/backoffice/billing/actions";
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

describe("start workspace trial action", () => {
  it("posts the capacity as a number and refreshes the billing table", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    const result = await startWorkspaceTrialAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        capacity: "3",
        reason: "teste comercial do Fabricio",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/package-contracts/workspace_1/start-trial",
      {
        method: "POST",
        body: JSON.stringify({
          capacity: 3,
          reason: "teste comercial do Fabricio",
        }),
      },
    );
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/billing");
  });

  it("escapes the workspace before building the trial path", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    await startWorkspaceTrialAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace/1",
        capacity: "1",
        reason: "teste comercial",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/package-contracts/workspace%2F1/start-trial",
      expect.any(Object),
    );
  });

  it("posts any seat count the API accepts", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    const result = await startWorkspaceTrialAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        capacity: "20",
        reason: "cliente grande em avaliacao",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          capacity: 20,
          reason: "cliente grande em avaliacao",
        }),
      }),
    );
    expect(result.status).toBe("success");
  });

  it.each(["0", "21", "2.5", "", "tres"])(
    "refuses the capacity %s that the API would reject",
    async (capacity) => {
      const result = await startWorkspaceTrialAction(
        initialBackofficeActionState,
        form({
          workspaceId: "workspace_1",
          capacity,
          reason: "teste comercial",
        }),
      );

      expect(serverApiFetch).not.toHaveBeenCalled();
      expect(result.status).toBe("error");
      expect(result.message).toContain("1 a 20");
    },
  );

  it("refuses a reason that is too short to audit", async () => {
    const result = await startWorkspaceTrialAction(
      initialBackofficeActionState,
      form({ workspaceId: "workspace_1", capacity: "1", reason: "ok" }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces the API message when the workspace already has a contract", async () => {
    serverApiFetch.mockRejectedValueOnce(
      new Error("Workspace ja possui contrato atual"),
    );

    const result = await startWorkspaceTrialAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        capacity: "1",
        reason: "teste comercial",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Workspace ja possui contrato atual",
      nonce: expect.any(Number),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("disable trial autoconvert action", () => {
  it("posts only the reason to the opt-out endpoint", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    const result = await disableTrialAutoconvertAction(
      initialBackofficeActionState,
      form({
        workspaceId: "workspace_1",
        reason: "cliente nao quer continuar",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/package-contracts/workspace_1/trial-autoconvert/disable",
      {
        method: "POST",
        body: JSON.stringify({ reason: "cliente nao quer continuar" }),
      },
    );
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/billing");
  });

  it("falls back to the default reason when the field is left empty", async () => {
    serverApiFetch.mockResolvedValueOnce({});

    await disableTrialAutoconvertAction(
      initialBackofficeActionState,
      form({ workspaceId: "workspace_1", reason: "   " }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          reason: "cliente pediu para nao cobrar apos o trial",
        }),
      }),
    );
  });

  it("keeps the trial and reports the failure when the API refuses", async () => {
    serverApiFetch.mockRejectedValueOnce(
      new Error("Trial atual nao encontrado"),
    );

    const result = await disableTrialAutoconvertAction(
      initialBackofficeActionState,
      form({ workspaceId: "workspace_1", reason: "cliente desistiu" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Trial atual nao encontrado");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
