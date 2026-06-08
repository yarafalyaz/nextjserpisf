"use client"

import { signOut, useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { getInitials } from "@/lib/utils/format"
import {
  Bell,
  LogOut,
  Search,
  Settings,
  User,
} from "lucide-react"
import Link from "next/link"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/shadcn/avatar"
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar"
import { Separator } from "@/components/ui/shadcn/separator"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"
import { Button } from "@/components/ui/shadcn/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"

const titleMap: Record<string, string> = {
  "/": "Dasbor",
  "/master": "Master Data",
  "/penjualan": "Penjualan",
  "/pembelian": "Pembelian",
  "/inventaris": "Inventaris",
  "/produksi": "Manufaktur",
  "/sdm": "SDM",
  "/keuangan": "Keuangan",
  "/crm": "CRM",
  "/kendaraan": "Kendaraan",
  "/proyek": "Proyek",
  "/aset": "Aset",
  "/laporan": "Laporan",
  "/pengaturan": "Pengaturan",
  "/profil": "Profil",
  "/notifikasi": "Notifikasi",
}

function pageTitle(pathname: string) {
  const exact = titleMap[pathname]
  if (exact) return exact

  const [section, leaf] = pathname.split("/").filter(Boolean)
  const base = titleMap[`/${section}`]

  if (!leaf) return base ?? "Silengkap"

  return leaf
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function Header() {
  const { data: session } = useSession()
  const pathname = usePathname()

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" id="sidebar-toggle" />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <h1 className="min-w-0 truncate text-base font-medium">{pageTitle(pathname)}</h1>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-8 w-[220px] justify-start gap-2 rounded-lg px-3 text-muted-foreground md:inline-flex lg:w-[280px]"
            id="global-search"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              document.dispatchEvent(event)
            }}
          >
            <Search className="size-4" />
            <span className="truncate text-xs">Tekan Cmd K untuk cari</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Cari"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              document.dispatchEvent(event)
            }}
          >
            <Search className="size-4" />
          </Button>

          <ThemeToggle />

          <NotificationDropdown />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu pengguna">
                <Avatar className="size-7 rounded-lg">
                  <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
                  <AvatarFallback className="rounded-lg text-xs">
                    {getInitials(session?.user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 rounded-lg" align="end">
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(session?.user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate font-medium">{session?.user?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{session?.user?.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/profil">
                    <User />
                    Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifikasi">
                    <Bell />
                    Notifikasi
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pengaturan">
                    <Settings />
                    Pengaturan
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault()
                  void signOut({ callbackUrl: "/login" })
                }}
              >
                <LogOut />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
