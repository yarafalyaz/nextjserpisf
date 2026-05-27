"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { getInitials } from "@/lib/utils/format"
import { Menu, Search, Bell, LogOut, User, Settings, ChevronDown } from "lucide-react"
import { useSidebarStore } from "@/lib/stores"
import Link from "next/link"
import { Badge, Tooltip, Avatar } from "@heroui/react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"
import { Button } from "@/components/ui/page-header"

export function Header() {
  const { data: session } = useSession()
  const { toggle } = useSidebarStore()
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
        <Button className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all header-menu-" id="sidebar-toggle" onClick={toggle}>
          <Menu size={22} />
        </Button>
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

        {/* Avatar with dropdown */}
        <div className="header-user-dropdown" ref={dropdownRef}>
          <Button
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all header-avatar-"
            onClick={() => setShowDropdown(!showDropdown)}
            id="user-avatar-btn"
          >
            <Avatar size="sm">
              <Avatar.Image src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
              <Avatar.Fallback>{getInitials(session?.user?.name)}</Avatar.Fallback>
            </Avatar>
            <div className="header-user-info">
              <span className="header-user-name">{session?.user?.name || "User"}</span>
              <span className="header-user-role">
                {((session?.user as any)?.roles?.[0] || "staff").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </span>
            </div>
            <ChevronDown size={14} className={`header-chevron ${showDropdown ? "open" : ""}`} />
          </Button>

          {showDropdown && (
            <div className="header-dropdown">
              <div className="header-dropdown-info">
                <Avatar size="sm">
                  <Avatar.Image src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
                  <Avatar.Fallback>{getInitials(session?.user?.name)}</Avatar.Fallback>
                </Avatar>
                <div>
                  <p className="header-dropdown-name">{session?.user?.name}</p>
                  <p className="header-dropdown-email">{session?.user?.email}</p>
                </div>
              </div>
              <div className="header-dropdown-divider" />
              <Link href="/profile" className="header-dropdown-item" onClick={() => setShowDropdown(false)}>
                <User size={16} />
                <span>Edit Profile</span>
              </Link>
              <Link href="/settings" className="header-dropdown-item" onClick={() => setShowDropdown(false)}>
                <Settings size={16} />
                <span>Settings</span>
              </Link>
              <div className="header-dropdown-divider" />
              <Button onClick={() => { import("next-auth/react").then(m => m.signOut({ callbackUrl: "/login" })) }} className="header-dropdown-item header-dropdown-danger">
                  <LogOut size={16} />
                  <span>Sign Out</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
