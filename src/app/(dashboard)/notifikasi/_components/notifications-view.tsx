"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { 
  Bell, 
  CheckCheck, 
  Clock, 
  ExternalLink, 
  FileText, 
  AlertCircle, 
  Info, 
  CheckCircle2 
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { notificationBodyHref } from "@/lib/notifications/body-href"
import { showError, showSuccess } from "@/lib/utils/toast"

export interface NotificationItem {
  id: number
  title: string
  body: string
  type: string
  readAt: string | Date | null
  createdAt: string | Date
}

interface NotificationsViewProps {
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
}

export function NotificationsView({
  initialNotifications,
  initialUnreadCount,
}: NotificationsViewProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all")
  const [isMarkingAll, setIsMarkingAll] = useState(false)

  const filteredItems = items.filter((item) => {
    if (filter === "unread") return !item.readAt
    if (filter === "read") return !!item.readAt
    return true
  })

  async function handleMarkAsRead(id: number) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" })
      if (!res.ok) throw new Error()
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      router.refresh()
    } catch {
      showError("Gagal memperbarui status notifikasi")
    }
  }

  async function handleMarkAllAsRead() {
    if (unreadCount === 0) return
    setIsMarkingAll(true)
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" })
      if (!res.ok) throw new Error()
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      )
      setUnreadCount(0)
      showSuccess("Semua notifikasi ditandai telah dibaca")
      router.refresh()
    } catch {
      showError("Gagal menandai semua notifikasi")
    } finally {
      setIsMarkingAll(false)
    }
  }

  const getTypeIcon = (type: string, title: string) => {
    const isApproval = title.toLowerCase().includes("persetujuan") || title.toLowerCase().includes("approval")
    if (isApproval) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <FileText className="h-5 w-5" />
        </div>
      )
    }
    switch (type) {
      case "danger":
      case "warning":
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-5 w-5" />
          </div>
        )
      case "success":
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        )
      default:
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Info className="h-5 w-5" />
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 font-medium transition-all ${
              filter === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
              filter === "unread"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Belum Dibaca
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("read")}
            className={`rounded-md px-3 py-1.5 font-medium transition-all ${
              filter === "read"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sudah Dibaca
          </button>
        </div>

        {/* Action Button */}
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            isDisabled={isMarkingAll}
            className="self-start sm:self-auto gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Tandai semua telah dibaca
          </Button>
        )}
      </div>

      {/* List of notifications */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
              <Bell className="h-7 w-7 opacity-60" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {filter === "unread" ? "Tidak ada notifikasi baru" : "Tidak ada notifikasi"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {filter === "unread"
                ? "Semua pemberitahuan dan tugas persetujuan Anda telah dibaca."
                : "Anda belum memiliki riwayat notifikasi di akun ini."}
            </p>
          </div>
        ) : (
          filteredItems.map((n) => {
            const href = notificationBodyHref(n.body)
            const isUnread = !n.readAt
            const createdDate = new Date(n.createdAt)
            const timeAgo = formatDistanceToNow(createdDate, {
              addSuffix: true,
              locale: idLocale,
            })

            return (
              <div
                key={n.id}
                className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border p-4 sm:p-5 transition-all duration-200 ${
                  isUnread
                    ? "bg-card shadow-sm border-primary/30 ring-1 ring-primary/10 hover:border-primary/50"
                    : "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                <div className="flex items-start gap-4">
                  {getTypeIcon(n.type, n.title)}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className={`text-sm sm:text-base font-semibold leading-tight ${
                          isUnread ? "text-foreground" : "text-foreground/80"
                        }`}
                      >
                        {n.title}
                      </h4>
                      {isUnread && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Baru
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {timeAgo}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-0 border-border/40">
                  {isUnread && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(n.id)}
                      className="text-xs h-8 text-muted-foreground hover:text-foreground"
                    >
                      Tandai dibaca
                    </Button>
                  )}
                  {href && (
                    <Button
                      size="sm"
                      variant={isUnread ? "primary" : "secondary"}
                      href={href}
                      className="gap-1.5 h-8 text-xs font-medium"
                      onClick={() => {
                        if (isUnread) void handleMarkAsRead(n.id)
                      }}
                    >
                      Buka
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
