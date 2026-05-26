import { auth } from "@/lib/auth/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { CommandPalette } from "@/components/layout/command-palette"
import { AppMain } from "@/components/layout/app-main"

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
      <div className="app-layout">
        <Sidebar />
        <AppMain>
          <Header />
          <main className="app-content">
            {children}
          </main>
        </AppMain>
      </div>
      <CommandPalette />
    </SessionProvider>
  )
}
