import type { Metadata } from "next"
import Script from "next/script"

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const settings = await getSystemSettings()
  const logoUrl = settings.companyLogo ?? "/favicon.ico"

  return (
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href={logoUrl} />
        <Script id="theme-init" strategy="beforeInteractive">{`
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
        <AuthProvider>
          <ThemeProvider>
            <UIProvider>{children}</UIProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
