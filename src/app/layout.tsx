import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"
import { Inter, JetBrains_Mono } from "next/font/google"
import { AuthProvider } from "@/components/providers/auth-provider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { UIProvider } from "@/components/providers/ui-provider"
import "./globals.css"
import "./print.css"

import { getSystemSettings } from "@/lib/utils/settings"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "YaraERP",
    template: "%s | YaraERP",
  },
  description: "Sistem ERP terintegrasi untuk manajemen bisnis - Penjualan, Pembelian, Inventaris, SDM, Keuangan",
}

/**
 * `interactiveWidget: "resizes-content"` membuat keyboard layar HP MENGECILKAN layout
 * viewport (default Next/browser hanya mengecilkan visual viewport). Tanpa ini, dialog
 * yang diposisikan `fixed` tetap dihitung terhadap layar penuh, sehingga bagian bawah
 * (termasuk tombol Simpan) tertutup keyboard dan terasa "tidak bisa di-scroll".
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const settings = await getSystemSettings()
  const logoUrl = settings.companyLogo ?? "/favicon.ico"
  // AUD-03: nonce CSP per-request dari proxy untuk script inline tema.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href={logoUrl} />
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>{`
          (function() {
            try {
              var theme = localStorage.getItem('theme') || 'system';
              var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.classList.add(dark ? 'dark' : 'light');
            } catch(e) {}
          })()
        `}</Script>
      </head>
      <body suppressHydrationWarning>
        {/*
          Skip-link — landmark pertama di <body> supaya pengguna keyboard/pembaca
          layar bisa melompati menu dan langsung ke konten. Target `#konten-utama`
          dipasang pada <main> di src/app/(dashboard)/layout.tsx.
          Pola Tailwind: `sr-only` (tersembunyi) → `focus:not-sr-only` (tampil saat
          fokus keyboard) + gaya fokus yang terlihat.
        */}
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:z-50 focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-card-foreground focus:shadow-md focus:ring-2 focus:ring-ring"
        >
          Lewati ke konten utama
        </a>
        <AuthProvider>
          <ThemeProvider>
            <UIProvider>{children}</UIProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
