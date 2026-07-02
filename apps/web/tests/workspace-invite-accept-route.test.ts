import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceInviteAcceptPage from "../src/app/(app)/settings/invites/accept/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspace invite accept route", () => {
  it("renders an invalid invite state when token is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const element = await WorkspaceInviteAcceptPage({
      searchParams: Promise.resolve({})
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain("Convite invalido");
    expect(html).toContain('href="/settings"');
  });

  it("renders an accept form with the token without calling the API during render", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const element = await WorkspaceInviteAcceptPage({
      searchParams: Promise.resolve({
        token: "invite_token_123"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain("Aceitar convite");
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="token"');
    expect(html).toContain('value="invite_token_123"');
    expect(html).toContain("email convidado");
  });
});
