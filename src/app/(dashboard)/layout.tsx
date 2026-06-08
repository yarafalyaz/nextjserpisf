import { auth } from "@/lib/auth/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { CommandPalette } from "@/components/layout/command-palette"
import { SidebarInset, SidebarProvider } from "@/components/ui/shadcn/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

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
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <main className="app-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
    </SessionProvider>
  )
}
