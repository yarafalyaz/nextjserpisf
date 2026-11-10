"use client"

import { signOut, useSession } from "next-auth/react"
import { getInitials } from "@/lib/utils/format"
import {
  Bell,
  LogOut,
  Search,
  Settings,
  User,
} from "@/components/ui/fontawesome-icons"
import Link from "next/link"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/shadcn/avatar"
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar"
import { Separator } from "@/components/ui/shadcn/separator"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"
import { SafeImage } from "@/components/ui/safe-image"
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

interface HeaderProps {
  companyLogo?: string
  companyLogoDark?: string
}

export function Header({ companyLogo, companyLogoDark }: HeaderProps = {}) {
  const { data: session } = useSession()

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-xs transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 hidden md:flex" id="sidebar-toggle" />
        <Separator orientation="vertical" className="mx-1 hidden md:block data-[orientation=vertical]:h-4" />
        {companyLogo && (
          <div className="flex items-center mr-2">
            <SafeImage
              src={companyLogo}
              alt="Logo"
              width={26}
              height={26}
              style={{ width: "auto", height: "26px" }}
              className="object-contain dark:hidden"
            />
            {companyLogoDark && (
              <SafeImage
                src={companyLogoDark}
                alt="Logo"
                width={26}
                height={26}
                style={{ width: "auto", height: "26px" }}
                className="object-contain hidden dark:block"
              />
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-8 w-[240px] justify-between gap-2 rounded-md border-border/80 bg-muted/35 px-2.5 text-muted-foreground shadow-2xs transition-colors duration-150 hover:border-border hover:bg-muted/60 hover:text-foreground md:inline-flex lg:w-[280px]"
            id="global-search"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              document.dispatchEvent(event)
            }}
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-xs font-normal">Cari menu atau aksi...</span>
            </span>
            <kbd className="pointer-events-none inline-flex h-5 shrink-0 items-center gap-0.5 rounded border border-border/80 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-11 md:hidden"
            aria-label="Cari"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              document.dispatchEvent(event)
            }}
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>

          <ThemeToggle />

          <NotificationDropdown />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-11 md:size-9" aria-label="Menu pengguna">
                <Avatar className="size-7 rounded-md ring-1 ring-border/60">
                  <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "Pengguna"} />
                  <AvatarFallback className="rounded-md bg-muted font-mono text-[11px] font-medium text-foreground">
                    {getInitials(session?.user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 rounded-lg" align="end">
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "Pengguna"} />
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
                    <User aria-hidden="true" />
                    Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifikasi">
                    <Bell aria-hidden="true" />
                    Notifikasi
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pengaturan">
                    <Settings aria-hidden="true" />
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
                <LogOut aria-hidden="true" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
