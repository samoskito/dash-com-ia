// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicenseClaimForm } from "../src/app/licenca/license-claim-form";
import {
  confirmClaimCode,
  requestClaimCode,
} from "../src/lib/license-claim-api";

vi.mock("../src/lib/license-claim-api", () => ({
  requestClaimCode: vi.fn(),
  confirmClaimCode: vi.fn(),
}));

const requestMock = vi.mocked(requestClaimCode);
const confirmMock = vi.mocked(confirmClaimCode);

const issued = {
  ok: true as const,
  status: "issued" as const,
  licenseKey: "PALMUP-AAAA-BBBB-CCCC-DDDD",
  accountIdentity: "aluno@x.com",
  keyPrefix: "PALMUP-AAAA",
  expiresAt: "2027-09-23T12:00:00.000Z",
};

beforeEach(() => {
  requestMock.mockResolvedValue({ ok: true });
  confirmMock.mockResolvedValue(issued);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderForm(props: Partial<React.ComponentProps<typeof LicenseClaimForm>> = {}) {
  return render(
    React.createElement(LicenseClaimForm, {
      supportEmail: "suporte@palmup.com.br",
      inProgressRetryDelayMs: 0,
      ...props,
    }),
  );
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>, email = "aluno@x.com") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Enviar código" }));
  await screen.findByLabelText("Código");
}

async function submitCode(user: ReturnType<typeof userEvent.setup>, code = "123456") {
  await user.type(screen.getByLabelText("Código"), code);
  await user.click(screen.getByRole("button", { name: "Confirmar" }));
}

describe("LicenseClaimForm", () => {
  it("goes from email to code to a one-time reveal of both env lines", async () => {
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user, "  Aluno@X.com ");
    expect(requestMock).toHaveBeenCalledWith("aluno@x.com", undefined);
    expect(
      screen.getByText(/Se o email for elegível, enviamos um código de 6 dígitos/),
    ).toBeTruthy();

    await submitCode(user);
    expect(confirmMock).toHaveBeenCalledWith("aluno@x.com", "123456");

    expect(
      await screen.findByText("LICENSE_KEY=PALMUP-AAAA-BBBB-CCCC-DDDD"),
    ).toBeTruthy();
    expect(screen.getByText("LICENSE_ACCOUNT_IDENTITY=aluno@x.com")).toBeTruthy();
    expect(screen.getByText(/Esta chave aparece só agora/)).toBeTruthy();
    expect(screen.queryByLabelText("Código")).toBeNull();
  });

  it("copies each env line to the clipboard", async () => {
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);
    await screen.findByText("LICENSE_KEY=PALMUP-AAAA-BBBB-CCCC-DDDD");

    await user.click(screen.getByRole("button", { name: "Copiar LICENSE_KEY" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "LICENSE_KEY=PALMUP-AAAA-BBBB-CCCC-DDDD",
    );

    await user.click(
      screen.getByRole("button", { name: "Copiar LICENSE_ACCOUNT_IDENTITY" }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "LICENSE_ACCOUNT_IDENTITY=aluno@x.com",
    );
  });

  it("shows the support email when the license was already issued and cannot be recovered", async () => {
    confirmMock.mockResolvedValue({
      ok: true,
      status: "already_issued_contact_support",
    });
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);

    expect(await screen.findByText(/Você já tem uma licença emitida/)).toBeTruthy();
    expect(screen.getByText("suporte@palmup.com.br")).toBeTruthy();
    expect(document.body.textContent).not.toContain("LICENSE_KEY=");
  });

  it("disables resend for 60 seconds after a code is requested", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm();

    await submitEmail(user);
    const resend = () =>
      screen.getByRole("button", { name: /Reenviar código/ }) as HTMLButtonElement;
    expect(resend().disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(resend().disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    await waitFor(() => expect(resend().disabled).toBe(false));

    await user.click(resend());
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resend().disabled).toBe(true));
  });

  it("shows a generic invalid-code message and keeps the code step", async () => {
    confirmMock.mockResolvedValue({ ok: false, code: "code_invalid" });
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);

    expect(await screen.findByText("Código inválido ou expirado.")).toBeTruthy();
    expect(screen.getByLabelText("Código")).toBeTruthy();
  });

  it("retries once when the claim is in progress", async () => {
    confirmMock
      .mockResolvedValueOnce({ ok: false, code: "in_progress" })
      .mockResolvedValueOnce(issued);
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);

    expect(
      await screen.findByText("LICENSE_KEY=PALMUP-AAAA-BBBB-CCCC-DDDD"),
    ).toBeTruthy();
    expect(confirmMock).toHaveBeenCalledTimes(2);
  });

  it("stops after one retry and explains the in-progress state", async () => {
    confirmMock
      .mockResolvedValueOnce({ ok: false, code: "in_progress" })
      .mockResolvedValueOnce({ ok: false, code: "code_invalid" });
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);

    expect(await screen.findByText(/A emissão da sua licença está em andamento/)).toBeTruthy();
    expect(confirmMock).toHaveBeenCalledTimes(2);
  });

  it("shows the rate-limit message on the email step", async () => {
    requestMock.mockResolvedValue({ ok: false, code: "rate_limited" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "aluno@x.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(
      await screen.findByText("Muitas tentativas. Aguarde alguns minutos."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Código")).toBeNull();
  });

  it("shows the unavailable message when the claim is disabled", async () => {
    requestMock.mockResolvedValue({ ok: false, code: "disabled" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "aluno@x.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText(/O resgate de licença está indisponível/)).toBeTruthy();
  });

  it("shows a retry message on network failure", async () => {
    confirmMock.mockResolvedValue({ ok: false, code: "network" });
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await submitCode(user);

    expect(await screen.findByText(/Não foi possível falar com o servidor/)).toBeTruthy();
  });

  it("lets the student go back and change the email", async () => {
    const user = userEvent.setup();
    renderForm();

    await submitEmail(user);
    await user.click(screen.getByRole("button", { name: "Trocar email" }));

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("aluno@x.com");
    expect(screen.queryByLabelText("Código")).toBeNull();
  });

  it("does not call the API for an invalid email or a short code", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "nope");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByText("Informe um email válido.")).toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Email"));
    await submitEmail(user);
    await submitCode(user, "123");
    expect(await screen.findByText("Digite os 6 dígitos do código.")).toBeTruthy();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("requires the captcha before sending when a site key is configured", async () => {
    const user = userEvent.setup();
    renderForm({ turnstileSiteKey: "0x4AAAAAAA-site-key" });

    await user.type(screen.getByLabelText("Email"), "aluno@x.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText("Conclua a verificação de segurança.")).toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
