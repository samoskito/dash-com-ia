import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles/globals.css";

const presentationModeBootstrap = `
  try {
    document.documentElement.dataset.presentationMode =
      window.localStorage.getItem("wpptrack-presentation-mode") === "true"
        ? "active"
        : "inactive";
  } catch {
    document.documentElement.dataset.presentationMode = "inactive";
  }
`;

export const metadata: Metadata = {
  title: "WppTrack",
  description:
    "Cockpit de WhatsApp, trafego e conversoes para clientes finais.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: presentationModeBootstrap }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
