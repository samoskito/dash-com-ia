import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LicenseClaimPage from "../src/app/licenca/page";

async function renderPage(): Promise<string> {
  const element = await LicenseClaimPage();
  return renderToStaticMarkup(createElement("div", null, element));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/licenca route", () => {
  it("renders the email step without any license material", async () => {
    vi.stubEnv("NEXT_PUBLIC_LICENSE_CLAIM_TURNSTILE_SITE_KEY", "");
    const html = await renderPage();

    expect(html).toContain("Resgatar licença RastrackDash");
    expect(html).toContain("Use o email da sua compra na PalmUP.");
    expect(html).toContain('name="email"');
    expect(html).toContain("Enviar código");
    expect(html).not.toContain("LICENSE_KEY");
    expect(html).not.toContain("LICENSE_ACCOUNT_IDENTITY");
  });

  it("omits the Turnstile widget when the site key is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_LICENSE_CLAIM_TURNSTILE_SITE_KEY", "");
    const html = await renderPage();

    expect(html).not.toContain("challenges.cloudflare.com");
    expect(html).not.toContain("cf-turnstile");
  });

  it("renders the Turnstile widget when the site key is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_LICENSE_CLAIM_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site-key");
    const html = await renderPage();

    expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).toContain("cf-turnstile");
    expect(html).toContain('data-sitekey="0x4AAAAAAA-site-key"');
  });
});
