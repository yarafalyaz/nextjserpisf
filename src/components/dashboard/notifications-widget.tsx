"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bell, Clock, ClipboardCheck, FileText, Package } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            Notifikasi Aktif
          </CardTitle>
          <CardDescription>Memuat sinyal operasional terbaru</CardDescription>
        </CardHeader>
        <CardContent
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="py-10 text-center text-sm text-muted-foreground"
        >
          Memuat...
        </CardContent>
      </Card>
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
      href: "/penjualan/faktur",
      color: "text-danger",
      bg: "bg-danger/10",
    },
    {
      icon: ClipboardCheck,
      label: "Pending Approval",
      count: data.pendingApprovalCount,
      href: "/pengaturan/persetujuan",
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      icon: Clock,
      label: "Telat Absen",
      count: data.lateAttendanceCount,
      href: "/sdm/absensi",
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" />
          Notifikasi Aktif
        </CardTitle>
        <CardDescription>Ringkasan alert, notifikasi, dan aktivitas terbaru</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div
          role="region"
          aria-label="Alert operasional"
          className="grid grid-cols-2 divide-x divide-y border-t md:grid-cols-4 md:divide-y-0"
        >
          {alerts.map((alert) => (
            <Link
              key={alert.label}
              href={alert.href}
              aria-label={`${alert.label}: ${alert.count}`}
              className="flex min-h-28 flex-col items-center justify-center gap-1.5 px-3 py-4 text-center transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div
                className={`flex size-10 items-center justify-center rounded-lg ${alert.bg}`}
                aria-hidden="true"
              >
                <alert.icon className={`size-4 ${alert.color}`} />
              </div>
              <span
                className={`text-xl font-semibold tabular-nums ${alert.count > 0 ? alert.color : "text-muted-foreground"}`}
                aria-hidden="true"
              >
                {alert.count}
              </span>
              <span className="text-xs leading-tight text-muted-foreground" aria-hidden="true">
                {alert.label}
              </span>
            </Link>
          ))}
        </div>

        {data.latestNotifications && data.latestNotifications.length > 0 && (
          <div className="border-t" role="region" aria-label="Notifikasi terbaru">
            <div className="flex items-center gap-1.5 px-5 py-3">
              <Bell className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">Notifikasi Terbaru</span>
            </div>
            <div className="divide-y">
              {data.latestNotifications.slice(0, 3).map((notif) => (
                <div key={notif.id} className={`flex items-start gap-3 px-5 py-3 ${!notif.readAt ? "bg-primary/5" : ""}`}>
                  <div
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      notif.type === "danger" ? "bg-danger" :
                      notif.type === "warning" ? "bg-warning" :
                      notif.type === "success" ? "bg-success" :
                      "bg-info"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{notif.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{notif.body}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: idLocale })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t" role="region" aria-label="Aktivitas terbaru">
          <div className="flex items-center gap-1.5 px-5 py-3">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase text-muted-foreground">Aktivitas Terbaru</span>
          </div>
          {data.recentActivities.length === 0 ? (
            <div className="px-5 pb-4 text-xs text-muted-foreground">Belum ada aktivitas</div>
          ) : (
            <div className="divide-y">
              {data.recentActivities.map((act) => (
                <div key={act.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {act.description || `${act.action} ${act.modelType}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: idLocale })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
