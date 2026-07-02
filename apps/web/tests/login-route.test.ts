import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "../src/app/login/page";

describe("login route", () => {
  it("renders the planned login entry point", () => {
    const html = renderToStaticMarkup(createElement(LoginPage));

    expect(html).toContain("Entrar no WppTrack");
    expect(html).toContain("Continuar com Google");
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
  });
});
