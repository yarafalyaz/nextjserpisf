"use client"

import { Button } from "@/components/ui/button"

import { useState, useRef, useEffect } from "react"
import { Bell } from "@/components/ui/fontawesome-icons"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { notificationBodyHref } from "@/lib/notifications/body-href"

interface Notification {
  id: number
  title: string
  body: string
  type: string
  readAt: string | null
  createdAt: string
}

export function NotificationDropdown() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [now] = useState(() => Date.now())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // R6WN-08: badge harus tampil sejak mount, bukan baru sesudah dropdown dibuka.
  useEffect(() => {
    void fetchNotifications()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function fetchNotifications() {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) {
        // Gagal memuat tidak boleh tampil sebagai "Tidak ada notifikasi".
        setLoadFailed(true)
        return
      }
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      // Kegagalan fetch = "gagal memuat", bukan daftar kosong.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    if (!isOpen) {
      void fetchNotifications()
    }
    setIsOpen(!isOpen)
  }

  async function markAsRead(id: number) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" })
      // Hanya tandai lokal kalau server menyimpannya; kalau tidak, badge "belum
      // dibaca" turun sendiri padahal notifikasi masih belum terbaca.
      if (!res.ok) return
    } catch {
      return
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  function timeAgo(dateStr: string) {
    const diff = now - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Baru saja"
    if (mins < 60) return `${mins} menit lalu`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} jam lalu`
    const days = Math.floor(hours / 24)
    return `${days} hari lalu`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onPress={handleToggle}
        variant="ghost" size="sm" isIconOnly className="size-11 header-notification-btn" aria-label="Buka notifikasi"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        id="notification-btn"
      >
        <span className="relative inline-flex">
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="notification-badge absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-background"
              aria-label={`${unreadCount} notifikasi belum dibaca`}
            />
          )}
        </span>
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-xs font-semibold tracking-tight text-foreground">Notifikasi</h3>
            {unreadCount > 0 && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-foreground">
                {unreadCount} baru
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : loadFailed ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell size={20} className="mb-2 opacity-40" />
                <p className="text-xs">Gagal memuat notifikasi</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell size={20} className="mb-2 opacity-40" />
                <p className="text-xs">Tidak ada notifikasi</p>
              </div>
            ) : (
              notifications.slice(0, 5).map((notif) => {
                const href = notificationBodyHref(notif.body)
                return (
                <button
                  key={notif.id}
                  type="button"
                  aria-disabled={notif.readAt ? true : undefined}
                  className={`flex w-full cursor-pointer gap-3 border-b border-border px-4 py-2.5 text-left transition-colors duration-150 last:border-0 hover:bg-muted/60 ${!notif.readAt ? "bg-muted/30" : ""}`}
                  onClick={() => {
                    if (!notif.readAt) void markAsRead(notif.id)
                    if (href) {
                      setIsOpen(false)
                      router.push(href)
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs ${!notif.readAt ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {notif.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {href ? "Buka dokumen terkait" : notif.body}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(notif.createdAt)}</p>
                  </div>
                  {!notif.readAt && (
                    <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
                )
              })
            )}
          </div>

          <div className="border-t border-border bg-muted/20 px-4 py-2">
            <Link
              href="/notifikasi"
              className="block text-center text-xs font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Lihat Semua Notifikasi
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
