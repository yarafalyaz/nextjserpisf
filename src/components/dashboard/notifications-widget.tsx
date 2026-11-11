"use client"

import { showError } from "@/lib/utils/toast"
import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowUpRight, Bell, Clock, ClipboardCheck, FileText, Package } from "@/components/ui/fontawesome-icons"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"

const ACTION_VERBS: Record<string, string> = {
  create: "Membuat",
  update: "Memperbarui",
  delete: "Menghapus",
  approve: "Menyetujui",
  reject: "Menolak",
  post: "Menerbitkan",
  void: "Membatalkan",
  confirm: "Mengonfirmasi",
  complete: "Menyelesaikan",
  rab_locked: "Mengunci RAB",
  rab_unlock_requested: "Meminta buka kunci RAB",
  rab_unlock_approved: "Menyetujui buka kunci RAB",
}

const MODEL_NAMES: Record<string, string> = {
  SalesInvoice: "Faktur",
  SalesOrder: "Pesanan Penjualan",
  Quotation: "Penawaran",
  DeliveryOrder: "Surat Jalan",
  PurchaseOrder: "Pesanan Pembelian",
  PurchaseRequest: "Permintaan Pembelian",
  VendorBill: "Tagihan",
  VendorPayment: "Pembayaran Vendor",
  Project: "Proyek",
  WorkOrder: "Perintah Kerja",
  MaterialIssue: "Pengeluaran Material",
  Journal: "Jurnal",
}

function formatActivityTitle(act: { action: string; modelType: string; refLabel?: string | null; description?: string | null }): string {
  const verb = ACTION_VERBS[act.action.toLowerCase()] || act.action
  const model = MODEL_NAMES[act.modelType] || act.modelType
  if (act.refLabel) {
    return `${verb} ${model} ${act.refLabel}`
  }
  if (act.description) {
    return act.description
  }
  return `${verb} ${model}`
}

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
    modelId: number | null
    refLabel: string | null
    href: string | null
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
    let isMounted = true
    async function loadNotifications() {
      try {
        const r = await fetch("/api/dashboard/notifications")
        const d = r.ok ? await r.json() : null
        if (d && isMounted) setData(d)
      } catch {
        if (isMounted) showError("Gagal memuat notifikasi")
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void loadNotifications()
    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            Sinyal & Aktivitas Operasional
          </CardTitle>
          <CardDescription>Memuat sinyal operasional terbaru</CardDescription>
        </CardHeader>
        <CardContent
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="border-t py-10 text-center text-sm text-muted-foreground"
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
      href: "/master/barang/stokmenipis",
      color: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    {
      icon: FileText,
      label: "Faktur Jatuh Tempo",
      count: data.overdueInvoiceCount,
      href: "/penjualan/faktur/jatuh-tempo",
      color: "text-red-600 dark:text-red-400",
      dot: "bg-red-500",
    },
    {
      icon: ClipboardCheck,
      label: "Menunggu Persetujuan",
      count: data.pendingApprovalCount,
      href: "/pengaturan/persetujuan/menunggu",
      color: "text-blue-600 dark:text-blue-400",
      dot: "bg-blue-500",
    },
    {
      icon: Clock,
      label: "Telat Absen",
      count: data.lateAttendanceCount,
      href: "/sdm/absensi?status=telat",
      color: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    },
  ]

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          Sinyal & Aktivitas Operasional
        </CardTitle>
        <CardDescription>Peringatan aktif, notifikasi sistem, dan jejak aktivitas</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div
          role="region"
          aria-label="Peringatan operasional"
          className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0"
        >
          {alerts.map((alert) => (
            <Link
              key={alert.label}
              href={alert.href}
              aria-label={`${alert.label}: ${alert.count}`}
              className="group flex flex-col justify-between gap-2 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${alert.count > 0 ? alert.dot : "bg-muted-foreground/30"}`}
                    aria-hidden="true"
                  />
                  <alert.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <ArrowUpRight
                  className="size-3.5 text-muted-foreground/50 transition-colors duration-150 group-hover:translate-x-0.5 group- group-hover:text-foreground"
                  aria-hidden="true"
                />
              </div>
              <div>
                <div
                  className={`text-xl font-semibold tracking-tight tabular-nums ${
                    alert.count > 0 ? alert.color : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {alert.count}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground" aria-hidden="true">
                  {alert.label}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {data.latestNotifications && data.latestNotifications.length > 0 && (
          <div className="border-t" role="region" aria-label="Notifikasi terbaru">
            <div className="flex items-center justify-between bg-muted/30 px-5 py-2">
              <div className="flex items-center gap-1.5">
                <Bell className="size-3 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Notifikasi Terbaru
                </span>
              </div>
              <Link href="/notifikasi" className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Semua
              </Link>
            </div>
            <div className="divide-y">
              {data.latestNotifications.slice(0, 3).map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 px-5 py-2.5 ${!notif.readAt ? "bg-muted/25" : ""}`}
                >
                  <div
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      notif.type === "danger"
                        ? "bg-red-500"
                        : notif.type === "warning"
                        ? "bg-amber-500"
                        : notif.type === "success"
                        ? "bg-emerald-500"
                        : "bg-blue-500"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-medium text-foreground">{notif.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: idLocale })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{notif.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t" role="region" aria-label="Aktivitas terbaru">
          <div className="flex items-center gap-1.5 bg-muted/30 px-5 py-2">
            <Clock className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Aktivitas Terbaru
            </span>
          </div>
          {data.recentActivities.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">Belum ada aktivitas</div>
          ) : (
            <div className="divide-y">
              {data.recentActivities.map((act) => (
                <div key={act.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
                    <p className="truncate text-xs font-medium text-foreground">
                      {act.href ? (
                        <Link href={act.href} className="underline-offset-4 hover:text-primary hover:underline">
                          {formatActivityTitle(act)}
                        </Link>
                      ) : (
                        formatActivityTitle(act)
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: idLocale })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
