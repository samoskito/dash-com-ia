// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { EndContractButton } from "../src/app/(backoffice)/backoffice/billing/end-contract-button";
import type { BackofficeActionState } from "../src/components/backoffice-action-form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderButton(
  action: (
    previous: BackofficeActionState,
    formData: FormData,
  ) => Promise<BackofficeActionState> = async () => ({
    status: "success",
    message: "Contrato encerrado e retirado da lista.",
    nonce: 1,
  }),
) {
  return render(
    React.createElement(EndContractButton, {
      workspaceId: "workspace_1",
      subscriptionId: "contract_1",
      planName: "Isento antigo",
      action,
    }),
  );
}

describe("EndContractButton", () => {
  it("asks for confirmation on the row instead of a native dialog", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Isento antigo");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });

  it("offers an editable default reason", async () => {
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    const reason = screen.getByLabelText("Motivo") as HTMLInputElement;

    expect(reason.value).toBe("encerrar contrato antigo");

    await userEvent.clear(reason);
    await userEvent.type(reason, "contrato duplicado");
    expect(reason.value).toBe("contrato duplicado");
  });

  it("submits the workspace, contract and reason to the action", async () => {
    const action = vi.fn(async (_previous: BackofficeActionState, formData: FormData) => ({
      status: "success" as const,
      message: "Contrato encerrado e retirado da lista.",
      nonce: Date.now(),
      received: formData,
    }));
    renderButton(action);

    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0]?.[1] as FormData;
    expect(formData.get("workspaceId")).toBe("workspace_1");
    expect(formData.get("subscriptionId")).toBe("contract_1");
    expect(formData.get("reason")).toBe("encerrar contrato antigo");
  });

  it("lets the operator back out without calling the action", async () => {
    const action = vi.fn();
    renderButton(action as never);

    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Manter" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeTruthy();
  });
});
