"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { formatDate } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import { safeJsonParse } from "@/lib/utils/safe-parse"

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
  const [processingId, setProcessingId] = useState<number | null>(null)

  const filteredData = items.filter((item) => {
    if (activeFilter === "unread") return !item.readAt
    if (activeFilter === "read") return !!item.readAt
    return true
  })

  // Format pesan agar bersih dari teks teknis URL seperti "Buka /pengaturan/..." atau "/penjualan/..."
  function cleanNotificationBody(body: string) {
    return body
      .replace(/\.?\s*Buka\s+\/[^\s]+/gi, "")
      .trim()
  }

  // Ekstrak URL target bila ada di dalam pesan notifikasi
  function extractNotificationHref(body: string): string | null {
    if (/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(body)) {
      return body
    }
    // Cari URL yang diawali kata kunci "Buka /..."
    const bukaMatch = body.match(/Buka\s+(\/[A-Za-z0-9/_-]+)/i)
    if (bukaMatch && bukaMatch[1]) {
      return bukaMatch[1]
    }
    // Atau URL rute standar aplikasi (dimulai dari salah satu modul utama)
    const routeMatch = body.match(/(\/(?:pengaturan|penjualan|pembelian|keuangan|inventaris|produksi|sdm|laporan|aset|crm|master)\/[A-Za-z0-9/_-]+)/)
    if (routeMatch && routeMatch[1]) {
      return routeMatch[1]
    }
    return null
  }

  // Cek apakah notifikasi ini merupakan persetujuan yang menunggu tindakan
  function isApprovalNotification(title: string, body: string) {
    const isApprovalText =
      title.toLowerCase().includes("persetujuan") ||
      title.toLowerCase().includes("approval") ||
      body.toLowerCase().includes("menunggu persetujuan")
    const hasApprovalUrl = body.includes("/pengaturan/persetujuan/")
    return isApprovalText && hasApprovalUrl
  }

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

  async function handleQuickDecision(
    notificationId: number,
    action: "approve" | "reject"
  ) {
    setProcessingId(notificationId)
    try {
      const res = await fetch(`/api/notifications/${notificationId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: action === "approve" ? "Disetujui via notifikasi" : "Ditolak via notifikasi",
        }),
      })

      const rawText = await res.text()
      const data = safeJsonParse<{ success?: boolean; message?: string; error?: { message?: string } }>(rawText)
      if (res.ok && data?.success) {
        showSuccess(data.message || (action === "approve" ? "Dokumen berhasil disetujui" : "Dokumen berhasil ditolak"))
        // Update status notifikasi menjadi terbaca secara lokal
        setItems((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
        router.refresh()
      } else {
        showError(data?.error?.message || data?.message || "Gagal memproses persetujuan")
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Terjadi kesalahan saat memproses persetujuan")
    } finally {
      setProcessingId(null)
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
      header: "Pemberitahuan",
      meta: { mobilePrimary: true },
      cell: (info) => {
        const item = info.row.original
        const isPathOnly = /^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(item.body)
        const href = extractNotificationHref(item.body)
        const isUnread = !item.readAt
        const cleanedBody = cleanNotificationBody(item.body)

        return (
          <div className="flex flex-col gap-1 py-1">
            <div className="flex items-center gap-2">
              {isUnread && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
              {href && !isPathOnly ? (
                <Link
                  href={href}
                  onClick={() => {
                    if (isUnread) void handleMarkAsRead(item.id)
                  }}
                  className={`hover:underline font-medium text-sm sm:text-base ${
                    isUnread ? "text-foreground font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {info.getValue()}
                </Link>
              ) : (
                <span className={`text-sm sm:text-base ${isUnread ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                  {info.getValue()}
                </span>
              )}
            </div>
            {isPathOnly && href ? (
              <Link
                href={href}
                onClick={() => {
                  if (isUnread) void handleMarkAsRead(item.id)
                }}
                className="text-xs sm:text-sm text-primary hover:underline"
              >
                Buka dokumen terkait
              </Link>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground">{cleanedBody}</p>
            )}
          </div>
        )
      },
    }),
    columnHelper.accessor("readAt", {
      header: "Status",
      cell: (info) => {
        const val = info.getValue()
        return val ? (
          <span className="text-xs text-muted-foreground">Dibaca</span>
        ) : (
          <span className="text-xs font-semibold text-primary">Baru</span>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => {
        const item = info.row.original
        const href = extractNotificationHref(item.body)
        const isUnread = !item.readAt
        const isApproval = isApprovalNotification(item.title, item.body)
        const isProcessing = processingId === item.id

        if (isApproval) {
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleQuickDecision(item.id, "approve")}
                className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isProcessing ? "..." : "Setujui"}
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleQuickDecision(item.id, "reject")}
                className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isProcessing ? "..." : "Tolak"}
              </button>
              {href && (
                <Link
                  href={href}
                  onClick={() => {
                    if (isUnread) void handleMarkAsRead(item.id)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline ml-1"
                >
                  Detail
                </Link>
              )}
            </div>
          )
        }

        return (
          <div className="flex items-center gap-3">
            {href && (
              <Link
                href={href}
                onClick={() => {
                  if (isUnread) void handleMarkAsRead(item.id)
                }}
                className="text-xs text-primary hover:underline font-medium"
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

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface text-muted-foreground hover:bg-surface-secondary border border-default"
            }`}
          >
            Semua ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("unread")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeFilter === "unread"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface text-muted-foreground hover:bg-surface-secondary border border-default"
            }`}
          >
            Belum Dibaca ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("read")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeFilter === "read"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface text-muted-foreground hover:bg-surface-secondary border border-default"
            }`}
          >
            Sudah Dibaca ({Math.max(0, items.length - unreadCount)})
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            disabled={isMarkingAll}
            onClick={handleMarkAllAsRead}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50 text-left sm:text-right cursor-pointer"
          >
            {isMarkingAll ? "Memproses..." : "Tandai Semua Telah Dibaca"}
          </button>
        )}
      </div>

      {/* Standar DataTable YaraERP */}
      <DataTable
        columns={columns}
        data={filteredData}
      />
    </div>
  )
}
