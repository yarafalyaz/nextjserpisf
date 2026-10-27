export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import {
  buildMonthGrid,
  monthParam,
  MONTH_LABELS,
  nextMonth,
  parseMonthParam,
  previousMonth,
  toDayKey,
  WEEKDAY_LABELS,
} from "@/lib/reports/calendar-grid"
import { notFound, redirect } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { parsePathFilterSegments } from "@/lib/utils/path-filters"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kalender" }

type EventKind = "invoice" | "invoice-due" | "bill" | "bill-due" | "delivery" | "expected" | "recurring"

interface CalendarEvent {
  date: Date
  kind: EventKind
  label: string
  amount: number | null
  href: string
}

const KIND_STYLES: Record<EventKind, { chip: string; label: string }> = {
  invoice: { chip: "bg-primary/12 text-primary border-primary/25", label: "Faktur" },
  // Teks chip memakai shade 700 (4.58:1 / 5.55:1 / 4.91:1 di latar chip 12%)
  // supaya lolos WCAG 1.4.3; di mode gelap dipakai shade 400 yang terang.
  "invoice-due": { chip: "bg-warning/12 text-amber-700 border-warning/25 dark:text-amber-400", label: "Jth Tempo AR" },
  bill: { chip: "bg-danger/12 text-red-700 border-danger/25 dark:text-red-400", label: "Tagihan" },
  "bill-due": { chip: "bg-danger/12 text-red-700 border-danger/25 dark:text-red-400", label: "Jth Tempo AP" },
  delivery: { chip: "bg-success/12 text-emerald-700 border-success/25 dark:text-emerald-400", label: "Kirim" },
  expected: { chip: "bg-surface-muted text-muted-foreground border-default", label: "Terima" },
  recurring: { chip: "bg-accent/12 text-accent-foreground border-accent/25", label: "Berulang" },
}

export default async function CalendarPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ bulan?: string }>
}) {
  await requirePermission("view_calendar")

  const params = await searchParams
  // Tautan lama `?bulan=YYYY-MM` diarahkan ke bentuk path.
  if (params.bulan) redirect(`/kalender/bulan/${params.bulan}`)

  const { segments } = await routeParams
  const filters = parsePathFilterSegments(segments, { bulan: /^\d{4}-\d{2}$/ })
  if (!filters) notFound()

  const today = new Date()
  const { year, month } = parseMonthParam(filters.bulan, today)
  const weeks = buildMonthGrid(year, month, today)

  const gridStart = weeks[0][0].date
  const gridEnd = new Date(weeks[5][6].date)
  gridEnd.setHours(23, 59, 59, 999)

  const [invoices, bills, deliveries, expected, recurring] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { deletedAt: null, OR: [{ date: { gte: gridStart, lte: gridEnd } }, { dueDate: { gte: gridStart, lte: gridEnd } }] },
      select: { id: true, slug: true, documentNo: true, date: true, dueDate: true, grandTotal: true, status: true },
    }),
    prisma.vendorBill.findMany({
      where: { deletedAt: null, OR: [{ date: { gte: gridStart, lte: gridEnd } }, { dueDate: { gte: gridStart, lte: gridEnd } }] },
      select: { id: true, slug: true, documentNo: true, date: true, dueDate: true, grandTotal: true, status: true },
    }),
    prisma.salesOrder.findMany({
      where: { deletedAt: null, deliveryDate: { gte: gridStart, lte: gridEnd } },
      select: { id: true, slug: true, documentNo: true, deliveryDate: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { deletedAt: null, expectedDate: { gte: gridStart, lte: gridEnd } },
      select: { id: true, slug: true, documentNo: true, expectedDate: true },
    }),
    prisma.recurringTransaction.findMany({
      where: { deletedAt: null, isActive: true, nextRunDate: { gte: gridStart, lte: gridEnd } },
      select: { id: true, slug: true, name: true, nextRunDate: true },
    }),
  ])

  const events = new Map<string, CalendarEvent[]>()
  const push = (event: CalendarEvent) => {
    const key = toDayKey(event.date)
    events.set(key, [...(events.get(key) ?? []), event])
  }

  for (const invoice of invoices) {
    // Drafts carry no recognised receivable yet — only flag them as scheduled.
    const settled = invoice.status !== "draft"
    push({ date: invoice.date, kind: "invoice", label: salesInvoiceLabel(invoice), amount: Number(invoice.grandTotal), href: `/penjualan/faktur/${invoice.slug ?? invoice.id}` })
    if (invoice.dueDate && settled) {
      push({ date: invoice.dueDate, kind: "invoice-due", label: `Tempo ${salesInvoiceLabel(invoice)}`, amount: Number(invoice.grandTotal), href: `/penjualan/faktur/${invoice.slug ?? invoice.id}` })
    }
  }
  for (const bill of bills) {
    push({ date: bill.date, kind: "bill", label: bill.documentNo, amount: Number(bill.grandTotal), href: `/pembelian/tagihan/${bill.slug ?? bill.id}` })
    if (bill.dueDate) {
      push({ date: bill.dueDate, kind: "bill-due", label: `Tempo ${bill.documentNo}`, amount: Number(bill.grandTotal), href: `/pembelian/tagihan/${bill.slug ?? bill.id}` })
    }
  }
  for (const order of deliveries) {
    if (!order.deliveryDate) continue
    push({ date: order.deliveryDate, kind: "delivery", label: order.documentNo, amount: null, href: `/penjualan/pesanan/${order.slug ?? order.id}` })
  }
  for (const order of expected) {
    if (!order.expectedDate) continue
    push({ date: order.expectedDate, kind: "expected", label: order.documentNo, amount: null, href: `/pembelian/pesanan/${order.slug ?? order.id}` })
  }
  for (const schedule of recurring) {
    push({ date: schedule.nextRunDate, kind: "recurring", label: schedule.name, amount: null, href: `/pengaturan/transaksi-berulang` })
  }

  const prev = previousMonth(year, month)
  const next = nextMonth(year, month)
  const monthLink = (target: { year: number; month: number }) => `/kalender/bulan/${monthParam(target.year, target.month)}`

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kalender" }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{MONTH_LABELS[month]} {year}</h1>
        <div className="flex items-center gap-2">
          <Link href={monthLink(prev)} className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">← Sebelumnya</Link>
          <Link href="/kalender" className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">Bulan ini</Link>
          <Link href={monthLink(next)} className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">Berikutnya →</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(KIND_STYLES) as EventKind[]).map((kind) => (
          <span key={kind} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${KIND_STYLES[kind].chip}`}>
            {KIND_STYLES[kind].label}
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-default overflow-hidden">
        <div className="grid grid-cols-7 bg-surface-muted border-b border-default">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-default last:border-b-0">
            {week.map((day) => {
              const dayEvents = events.get(day.key) ?? []
              return (
                <div
                  key={day.key}
                  className={`min-h-[110px] border-r border-default last:border-r-0 p-1.5 flex flex-col gap-1 ${day.inMonth ? "bg-surface" : "bg-surface-muted/40"}`}
                >
                  <span className={`text-xs font-semibold ${day.isToday ? "inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : day.inMonth ? "text-foreground" : "text-muted-foreground"}`}>
                    {day.date.getDate()}
                  </span>
                  {dayEvents.slice(0, 3).map((event, index) => (
                    <Link
                      key={`${event.kind}-${event.label}-${index}`}
                      href={event.href}
                      title={`${KIND_STYLES[event.kind].label}: ${event.label}${event.amount !== null ? ` — ${formatCurrency(event.amount)}` : ""}`}
                      className={`truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight ${KIND_STYLES[event.kind].chip}`}
                    >
                      {event.label}
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} lagi</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
