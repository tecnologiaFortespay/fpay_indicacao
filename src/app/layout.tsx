import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fortes Pay · Indicações", template: "%s · Fortes Pay" },
  description: "Plataforma de indicação de parceiros da Fortes Pay",
  robots: { index: false, follow: false },
};

const THEME_SCRIPT =
  'try{if(localStorage.getItem("fortes-pay-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, sem piscar o claro. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
