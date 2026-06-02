"use client"

import { Button } from "@/components/ui/page-header"

import { useState, useRef, useEffect } from "react"
import { Bell } from "lucide-react"
import { Badge } from "@heroui/react"
import Link from "next/link"

interface Notification {
  id: number
  title: string
  body: string
  type: string
  readAt: string | null
  createdAt: string
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [now] = useState(() => Date.now())
  const dropdownRef = useRef<HTMLDivElement>(null)

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
    try {
      const res = await fetch("/api/notifikasi")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    if (!isOpen) {
      fetchNotifications()
    }
    setIsOpen(!isOpen)
  }

  async function markAsRead(id: number) {
    await fetch(`/api/notifikasi/${id}/read`, { method: "POST" })
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
        variant="ghost" size="sm" isIconOnly className="header-notification-btn" aria-label="Buka notifikasi"
        aria-expanded={isOpen}
        id="notification-btn"
      >
        <Badge.Anchor>
          <Bell size={20} />
          {unreadCount > 0 && <Badge color="danger" size="sm" />}
        </Badge.Anchor>
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-xl border border-default shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-default">
            <h3 className="text-sm font-semibold text-foreground">Notifikasi</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-primary font-medium">{unreadCount} baru</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted">
                <Bell size={24} className="mb-2 opacity-40" />
                <p className="text-sm">Tidak ada notifikasi</p>
              </div>
            ) : (
              notifications.slice(0, 5).map((notif) => (
                <div
                  key={notif.id}
                  className={`flex gap-3 px-4 py-3 border-b border-default last:border-0 hover:bg-surface-secondary transition-colors cursor-pointer ${!notif.readAt ? "bg-primary/5" : ""}`}
                  onClick={() => !notif.readAt && markAsRead(notif.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${!notif.readAt ? "font-semibold text-foreground" : "text-muted"}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted truncate mt-0.5">{notif.body}</p>
                    <p className="text-[10px] text-muted mt-1">{timeAgo(notif.createdAt)}</p>
                  </div>
                  {!notif.readAt && (
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-primary" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-default px-4 py-2.5">
            <Link
              href="/notifikasi"
              className="block text-center text-xs font-medium text-primary hover:text-primary-hover transition-colors"
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
