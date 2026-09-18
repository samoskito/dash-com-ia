// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TrialAutoconvertButton } from "../src/app/(backoffice)/backoffice/billing/trial-autoconvert-button";
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
    message: "Auto-cobranca desligada. O trial termina sem gerar cobranca.",
    nonce: 1,
  }),
) {
  return render(
    React.createElement(TrialAutoconvertButton, {
      workspaceId: "workspace_1",
      workspaceName: "Cliente Trial",
      action,
    }),
  );
}

describe("TrialAutoconvertButton", () => {
  it("asks for confirmation on the row instead of a native dialog", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderButton();

    await userEvent.click(
      screen.getByRole("button", { name: "Desligar auto-cobranca" }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Cliente Trial");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });

  it("offers an editable default reason", async () => {
    renderButton();

    await userEvent.click(
      screen.getByRole("button", { name: "Desligar auto-cobranca" }),
    );
    const reason = screen.getByLabelText("Motivo") as HTMLInputElement;

    expect(reason.value).toBe("cliente pediu para nao cobrar apos o trial");

    await userEvent.clear(reason);
    await userEvent.type(reason, "cliente desistiu");
    expect(reason.value).toBe("cliente desistiu");
  });

  it("submits the workspace and the reason to the action", async () => {
    const action = vi.fn(
      async (_previous: BackofficeActionState, formData: FormData) => ({
        status: "success" as const,
        message: "Auto-cobranca desligada.",
        nonce: Date.now(),
        received: formData,
      }),
    );
    renderButton(action);

    await userEvent.click(
      screen.getByRole("button", { name: "Desligar auto-cobranca" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0]?.[1] as FormData;
    expect(formData.get("workspaceId")).toBe("workspace_1");
    expect(formData.get("reason")).toBe(
      "cliente pediu para nao cobrar apos o trial",
    );
  });

  it("lets the operator back out without calling the action", async () => {
    const action = vi.fn();
    renderButton(action as never);

    await userEvent.click(
      screen.getByRole("button", { name: "Desligar auto-cobranca" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Manter" }));

    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Desligar auto-cobranca" }),
    ).toBeTruthy();
  });
});
