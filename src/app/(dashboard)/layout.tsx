import { auth } from "@/lib/auth/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { CommandPalette } from "@/components/layout/command-palette"
import { SidebarInset, SidebarProvider } from "@/components/ui/shadcn/sidebar"
import type { Metadata } from "next"
import { getSystemSettings } from "@/lib/utils/settings"

export const metadata: Metadata = {
  title: {
    template: "%s — Silengkap",
    default: "Silengkap ERP",
  },
  description: "Sistem ERP bengkel otomotif",
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  // Block deactivated users even if their session/token is still valid
  if ((session.user as { isActive?: boolean }).isActive === false) {
    redirect("/login?reason=deactivated")
  }

  const settings = await getSystemSettings()

  return (
    <SessionProvider session={session}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar companyName={settings.companyName ?? undefined} companyLogo={settings.companyLogo ?? undefined} />
        <SidebarInset>
          <SiteHeader />
          <main className="app-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
    </SessionProvider>
  )
}
