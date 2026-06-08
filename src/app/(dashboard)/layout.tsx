import { auth } from "@/lib/auth/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { AppSidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
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
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <main className="app-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
    </SessionProvider>
  )
}
