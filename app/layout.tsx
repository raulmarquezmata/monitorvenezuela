import type { Metadata, Viewport } from "next";
import { BRAND, BRAND_NAME } from "@/lib/brand";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND_NAME.es, template: `%s · ${BRAND_NAME.es}` },
  icons: BRAND === "solfin" ? { icon: "/brand/solfin-isotipo.svg", apple: "/pwa-icon?s=180" } : undefined,
  appleWebApp: { capable: true, title: BRAND_NAME.es, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  description: "Mercados y macroeconomía de Venezuela actualizados automáticamente: BVC, tipo de cambio, liquidez, reservas, inflación, banca, petróleo, comercio exterior y noticias.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // usa toda la pantalla en teléfonos con muesca (los márgenes los ponen las barras)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND === "solfin" ? "#f2f2f2" : "#f2f4f2" },
    { media: "(prefers-color-scheme: dark)", color: BRAND === "solfin" ? "#0b1122" : "#111613" },
  ],
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
