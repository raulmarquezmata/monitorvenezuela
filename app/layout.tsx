import type { Metadata } from "next";
import { BRAND, BRAND_NAME } from "@/lib/brand";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND_NAME.es, template: `%s · ${BRAND_NAME.es}` },
  icons: BRAND === "solfin" ? { icon: "/brand/solfin-isotipo.svg" } : undefined,
  description: "Mercados y macroeconomía de Venezuela actualizados automáticamente: BVC, tipo de cambio, liquidez, reservas, inflación, banca, petróleo, comercio exterior y noticias.",
};

// Aplica el tema elegido antes de pintar, para evitar el destello claro/oscuro
const themeScript = `try{var m=localStorage.getItem("theme");if(m==="light"||m==="dark")document.documentElement.setAttribute("data-theme",m)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-brand={BRAND} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<Analytics /></body>
    </html>
  );
}
