import type { Metadata } from "next"
import Script from "next/script"
import { Inter, JetBrains_Mono } from "next/font/google"
import { AuthProvider } from "@/components/providers/auth-provider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { UIProvider } from "@/components/providers/ui-provider"
import "@heroui/react/styles"
import "./globals.css"
import "./print.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "YaraERP - Enterprise Resource Planning",
  description: "Sistem ERP terintegrasi untuk manajemen bisnis - Sales, Purchase, Inventory, HRM, Finance",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
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
