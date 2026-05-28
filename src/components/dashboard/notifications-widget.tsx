"use client"

import { useState, useEffect } from "react"
import { Bell, Package, FileText, ClipboardCheck, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"

interface NotificationData {
  lowStockCount: number
  overdueInvoiceCount: number
  pendingApprovalCount: number
  lateAttendanceCount: number
  absentEmployeeCount: number
  recentActivities: {
    id: number
    action: string
    modelType: string
    description: string | null
    createdAt: string
  }[]
  latestNotifications: {
    id: number
    title: string
    body: string
    type: string
    readAt: string | null
    createdAt: string
  }[]
}

export function NotificationsWidget() {
  const [data, setData] = useState<NotificationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dashboard/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-default">
          <Bell size={16} className="text-foreground" />
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Notifikasi Aktif</h2>
        </div>
        <div className="px-5 py-10 text-center text-sm text-muted">Memuat...</div>
      </div>
    )
  }

  if (!data) return null

  const alerts = [
    {
      icon: Package,
      label: "Stok Menipis",
      count: data.lowStockCount,
      href: "/master/barang",
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      icon: FileText,
      label: "Invoice Overdue",
      count: data.overdueInvoiceCount,
      href: "/penjualan/tagihan",
      color: "text-danger",
      bg: "bg-danger/10",
    },
    {
      icon: ClipboardCheck,
      label: "Pending Approval",
      count: data.pendingApprovalCount,
      href: "/persetujuan",
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      icon: Clock,
      label: "Telat Absen",
      count: data.lateAttendanceCount,
      href: "/hrm/absensi",
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ]

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-default">
        <Bell size={16} className="text-foreground" />
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Notifikasi Aktif</h2>
      </div>

      {/* Alert Counts */}
      <div className="grid grid-cols-4 divide-x divide-default">
        {alerts.map((alert) => (
          <a
            key={alert.label}
            href={alert.href}
            className="flex flex-col items-center gap-1.5 py-4 px-3 hover:bg-hover transition-colors"
          >
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${alert.bg}`}>
              <alert.icon size={18} className={alert.color} />
            </div>
            <span className={`text-lg font-bold ${alert.count > 0 ? alert.color : "text-muted"}`}>
              {alert.count}
            </span>
            <span className="text-[0.6875rem] text-muted text-center leading-tight">{alert.label}</span>
          </a>
        ))}
      </div>

      {/* Latest Notifications */}
      {data.latestNotifications && data.latestNotifications.length > 0 && (
        <div className="border-t border-default">
          <div className="px-5 py-3 flex items-center gap-1.5">
            <Bell size={13} className="text-muted" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Notifikasi Terbaru</span>
          </div>
          <div className="divide-y divide-default">
            {data.latestNotifications.slice(0, 3).map((notif) => (
              <div key={notif.id} className={`flex items-start gap-3 px-5 py-3 ${!notif.readAt ? "bg-primary/5" : ""}`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  notif.type === "danger" ? "bg-danger" :
                  notif.type === "warning" ? "bg-warning" :
                  notif.type === "success" ? "bg-success" :
                  "bg-info"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground font-medium truncate">{notif.title}</p>
                  <p className="text-[0.6875rem] text-muted mt-0.5 truncate">{notif.body}</p>
                  <p className="text-[0.6875rem] text-muted mt-0.5">
                    {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: idLocale })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="border-t border-default">
        <div className="px-5 py-3 flex items-center gap-1.5">
          <Clock size={13} className="text-muted" />
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Aktivitas Terbaru</span>
        </div>
        {data.recentActivities.length === 0 ? (
          <div className="px-5 pb-4 text-xs text-muted">Belum ada aktivitas</div>
        ) : (
          <div className="divide-y divide-default">
            {data.recentActivities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 px-5 py-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground font-medium truncate">
                    {act.description || `${act.action} ${act.modelType}`}
                  </p>
                  <p className="text-[0.6875rem] text-muted mt-0.5">
                    {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: idLocale })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
