"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { getInitials } from "@/lib/utils/format"
import { Search, LogOut, User, Settings } from "lucide-react"
import Link from "next/link"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/shadcn/avatar"
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar"
import { Separator } from "@/components/ui/shadcn/separator"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"
import { Button } from "@/components/ui/page-header"

export function Header() {
  const { data: session } = useSession()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="header">
      <div className="header-left">
        <SidebarTrigger className="-ml-1" id="sidebar-toggle" />
        <Separator orientation="vertical" className="mr-1 h-5" />
        <div className="header-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Tekan ⌘K untuk cari..."
            className="header-search-input"
            id="global-search"
            readOnly
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              document.dispatchEvent(event)
            }}
          />
        </div>
      </div>

      <div className="header-right">
        <ThemeToggle />

        <NotificationDropdown />

        {/* Avatar dropdown — hidden on desktop (md+) since user menu lives in the sidebar footer */}
        <div className="header-user-dropdown md:hidden" ref={dropdownRef}>
          <Button
            variant="ghost" className="header-avatar-btn" aria-haspopup="menu"
            aria-expanded={showDropdown}
            onPress={() => setShowDropdown(!showDropdown)}
            id="user-avatar-btn"
          >
            <Avatar size="sm">
              <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
              <AvatarFallback>{getInitials(session?.user?.name)}</AvatarFallback>
            </Avatar>
          </Button>

          {showDropdown && (
            <div className="header-dropdown">
              <div className="header-dropdown-info">
                <Avatar size="sm">
                  <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
                  <AvatarFallback>{getInitials(session?.user?.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="header-dropdown-name">{session?.user?.name}</p>
                  <p className="header-dropdown-email">{session?.user?.email}</p>
                </div>
              </div>
              <div className="header-dropdown-divider" />
              <Link href="/profil" className="header-dropdown-item" onClick={() => setShowDropdown(false)}>
                <User size={16} />
                <span>Ubah Profil</span>
              </Link>
              <Link href="/pengaturan" className="header-dropdown-item" onClick={() => setShowDropdown(false)}>
                <Settings size={16} />
                <span>Pengaturan</span>
              </Link>
              <div className="header-dropdown-divider" />
              <Button onPress={() => { import("next-auth/react").then(m => m.signOut({ callbackUrl: "/login" })) }} className="header-dropdown-item header-dropdown-danger">
                  <LogOut size={16} />
                  <span>Keluar</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
