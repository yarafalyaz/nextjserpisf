"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { notificationBodyHref } from "@/lib/notifications/body-href"
import { formatDate } from "@/lib/utils/format"
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

const columnHelper = createColumnHelper<NotificationItem>()

export function NotificationsView({
  initialNotifications,
  initialUnreadCount,
}: NotificationsViewProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "read">("all")
  const [isMarkingAll, setIsMarkingAll] = useState(false)

  const filteredData = items.filter((item) => {
    if (activeFilter === "unread") return !item.readAt
    if (activeFilter === "read") return !!item.readAt
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

  const columns = [
    columnHelper.accessor("createdAt", {
      header: "Waktu",
      cell: (info) => (
        <span className="text-muted-foreground whitespace-nowrap text-sm">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("title", {
      header: "Judul",
      meta: { mobilePrimary: true },
      cell: (info) => {
        const item = info.row.original
        const href = notificationBodyHref(item.body)
        const isUnread = !item.readAt

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {isUnread && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
              {href ? (
                <Link
                  href={href}
                  onClick={() => {
                    if (isUnread) void handleMarkAsRead(item.id)
                  }}
                  className={`hover:underline font-medium ${
                    isUnread ? "text-foreground font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {info.getValue()}
                </Link>
              ) : (
                <span className={isUnread ? "text-foreground font-semibold" : "text-muted-foreground"}>
                  {info.getValue()}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{item.body}</p>
          </div>
        )
      },
    }),
    columnHelper.accessor("readAt", {
      header: "Status",
      cell: (info) => {
        const val = info.getValue()
        return val ? (
          <span className="text-sm text-muted-foreground">Dibaca</span>
        ) : (
          <span className="text-sm font-semibold text-primary">Baru</span>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: (info) => {
        const item = info.row.original
        const href = notificationBodyHref(item.body)
        const isUnread = !item.readAt

        return (
          <div className="flex items-center gap-3">
            {href && (
              <Link
                href={href}
                onClick={() => {
                  if (isUnread) void handleMarkAsRead(item.id)
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Buka
              </Link>
            )}
            {isUnread && (
              <button
                type="button"
                onClick={() => handleMarkAsRead(item.id)}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Tandai dibaca
              </button>
            )}
          </div>
        )
      },
    }),
  ]

  const filterChips = (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setActiveFilter("all")}
        className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
      >
        Semua ({items.length})
      </button>
      <button
        type="button"
        onClick={() => setActiveFilter("unread")}
        className={`filter-chip ${activeFilter === "unread" ? "active" : ""}`}
      >
        Belum Dibaca {unreadCount > 0 && `(${unreadCount})`}
      </button>
      <button
        type="button"
        onClick={() => setActiveFilter("read")}
        className={`filter-chip ${activeFilter === "read" ? "active" : ""}`}
      >
        Sudah Dibaca
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll}
            className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
          >
            {isMarkingAll ? "Memproses..." : "Tandai semua telah dibaca"}
          </button>
        </div>
      )}

      <DataTable
        data={filteredData}
        columns={columns}
        filters={filterChips}
      />
    </div>
  )
}
