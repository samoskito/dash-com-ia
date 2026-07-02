import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "../src/app/login/page";

describe("login route", () => {
  it("renders the planned login entry point", async () => {
    const element = await LoginPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Entrar no WppTrack");
    expect(html).toContain("Telemetria de conversoes");
    expect(html).toContain("Entrar com Google");
    expect(html).toContain('href="/login/google"');
    expect(html).toContain("Status da plataforma");
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
  });

  it("renders a clear Google OAuth callback error", async () => {
    const element = await LoginPage({
      searchParams: Promise.resolve({
        error: "google_exchange"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nao foi possivel concluir o login com Google.");
  });
});
