export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { formatCurrencyExact } from "@/lib/utils/format"
import {
  buildMonthGrid,
  monthParam,
  MONTH_LABELS,
  nextMonth,
  parseMonthParam,
  previousMonth,
  toDayKey,
} from "@/lib/reports/calendar-grid"
import { notFound, redirect } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { parsePathFilterSegments } from "@/lib/utils/path-filters"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { RECOGNISED_AP_STATUSES, RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  CalendarBoard,
  type CalendarEventKind,
  type SerializedCalendarDay,
  type SerializedCalendarEvent,
} from "../_components/calendar-board"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kalender" }

export default async function CalendarPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ bulan?: string }>
}) {
  await requirePermission("view_calendar")

  // Izin granular lintas modul: view_calendar saja tidak membuka dokumen/nominal modul lain.
  const [
    canViewSalesInvoices,
    canViewVendorBills,
    canViewReports,
    canViewSalesOrders,
    canViewPurchaseOrders,
    canManageRecurring,
  ] = await Promise.all([
    hasPermission("view_sales_invoices"),
    hasPermission("view_vendor_bills"),
    hasPermission("view_reports"),
    hasPermission("view_sales_orders"),
    hasPermission("view_purchase_orders"),
    hasPermission("manage_recurring_transactions"),
  ])

  const canSeeAr = canViewSalesInvoices || canViewReports
  const canSeeAp = canViewVendorBills || canViewReports

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

  const [invoices, bills, deliveries, expected, recurring, holidays] = await Promise.all([
    canSeeAr
      ? prisma.salesInvoice.findMany({
          where: {
            deletedAt: null,
            status: { in: [...RECOGNISED_AR_STATUSES] },
            OR: [
              { date: { gte: gridStart, lte: gridEnd } },
              { dueDate: { gte: gridStart, lte: gridEnd } },
            ],
          },
          select: {
            id: true,
            slug: true,
            documentNo: true,
            date: true,
            dueDate: true,
            grandTotal: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    canSeeAp
      ? prisma.vendorBill.findMany({
          where: {
            deletedAt: null,
            status: { in: [...RECOGNISED_AP_STATUSES] },
            OR: [
              { date: { gte: gridStart, lte: gridEnd } },
              { dueDate: { gte: gridStart, lte: gridEnd } },
            ],
          },
          select: {
            id: true,
            slug: true,
            documentNo: true,
            date: true,
            dueDate: true,
            grandTotal: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    canViewSalesOrders
      ? prisma.salesOrder.findMany({
          where: { deletedAt: null, deliveryDate: { gte: gridStart, lte: gridEnd } },
          select: { id: true, slug: true, documentNo: true, deliveryDate: true },
        })
      : Promise.resolve([]),
    canViewPurchaseOrders
      ? prisma.purchaseOrder.findMany({
          where: { deletedAt: null, expectedDate: { gte: gridStart, lte: gridEnd } },
          select: { id: true, slug: true, documentNo: true, expectedDate: true },
        })
      : Promise.resolve([]),
    canManageRecurring
      ? prisma.recurringTransaction.findMany({
          where: { deletedAt: null, isActive: true, nextRunDate: { gte: gridStart, lte: gridEnd } },
          select: { id: true, slug: true, name: true, nextRunDate: true },
        })
      : Promise.resolve([]),
    prisma.holiday.findMany({
      where: { date: { gte: gridStart, lte: gridEnd } },
      select: { id: true, name: true, date: true },
    }),
  ])

  const events: SerializedCalendarEvent[] = []

  for (const invoice of invoices) {
    const label = salesInvoiceLabel(invoice)
    const href = `/penjualan/faktur/${invoice.slug ?? invoice.id}`
    const amount = Number(invoice.grandTotal)
    const amountFormatted = formatCurrencyExact(amount)
    events.push({
      id: `inv-${invoice.id}`,
      dayKey: toDayKey(invoice.date),
      kind: "invoice",
      label,
      amount,
      amountFormatted,
      href,
    })
    if (invoice.dueDate) {
      events.push({
        id: `inv-due-${invoice.id}`,
        dayKey: toDayKey(invoice.dueDate),
        kind: "invoice-due",
        label: `Tempo ${label}`,
        amount,
        amountFormatted,
        href,
      })
    }
  }

  for (const bill of bills) {
    const href = `/pembelian/tagihan/${bill.slug ?? bill.id}`
    events.push({
      id: `bill-${bill.id}`,
      dayKey: toDayKey(bill.date),
      kind: "bill",
      label: bill.documentNo,
      amount: Number(bill.grandTotal),
      href,
    })
    if (bill.dueDate) {
      events.push({
        id: `bill-due-${bill.id}`,
        dayKey: toDayKey(bill.dueDate),
        kind: "bill-due",
        label: `Tempo ${bill.documentNo}`,
        amount: Number(bill.grandTotal),
        href,
      })
    }
  }

  for (const order of deliveries) {
    if (!order.deliveryDate) continue
    events.push({
      id: `so-${order.id}`,
      dayKey: toDayKey(order.deliveryDate),
      kind: "delivery",
      label: order.documentNo,
      amount: null,
      href: `/penjualan/pesanan/${order.slug ?? order.id}`,
    })
  }

  for (const order of expected) {
    if (!order.expectedDate) continue
    events.push({
      id: `po-${order.id}`,
      dayKey: toDayKey(order.expectedDate),
      kind: "expected",
      label: order.documentNo,
      amount: null,
      href: `/pembelian/pesanan/${order.slug ?? order.id}`,
    })
  }

  for (const schedule of recurring) {
    events.push({
      id: `rec-${schedule.id}`,
      dayKey: toDayKey(schedule.nextRunDate),
      kind: "recurring",
      label: schedule.name,
      amount: null,
      href: `/pengaturan/transaksi-berulang`,
    })
  }

  for (const holiday of holidays) {
    events.push({
      id: `hol-${holiday.id}`,
      dayKey: toDayKey(holiday.date),
      kind: "holiday",
      label: holiday.name,
      amount: null,
      href: `/sdm/kalender-kerja`,
    })
  }

  const availableKinds: CalendarEventKind[] = [
    ...(canSeeAr ? (["invoice", "invoice-due"] as CalendarEventKind[]) : []),
    ...(canSeeAp ? (["bill", "bill-due"] as CalendarEventKind[]) : []),
    ...(canViewSalesOrders ? (["delivery"] as CalendarEventKind[]) : []),
    ...(canViewPurchaseOrders ? (["expected"] as CalendarEventKind[]) : []),
    ...(canManageRecurring ? (["recurring"] as CalendarEventKind[]) : []),
    "holiday",
  ]

  const serializedWeeks: SerializedCalendarDay[][] = weeks.map((week) =>
    week.map((day) => ({
      key: day.key,
      dayNumber: day.date.getDate(),
      inMonth: day.inMonth,
      isToday: day.isToday,
      fullDateLabel: day.date.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    })),
  )

  const todayDay = serializedWeeks.flat().find((d) => d.isToday)
  const firstInMonthDay = serializedWeeks.flat().find((d) => d.inMonth)
  const inMonthEventKeys = new Set(
    events
      .map((e) => e.dayKey)
      .filter((k) => serializedWeeks.flat().some((d) => d.inMonth && d.key === k)),
  )
  const firstEventDay = serializedWeeks
    .flat()
    .find((d) => d.inMonth && inMonthEventKeys.has(d.key))
  const defaultSelectedDayKey =
    todayDay?.key ?? firstEventDay?.key ?? firstInMonthDay?.key ?? serializedWeeks[0][0].key

  const prev = previousMonth(year, month)
  const next = nextMonth(year, month)
  const monthLink = (target: { year: number; month: number }) =>
    `/kalender/bulan/${monthParam(target.year, target.month)}`

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kalender" }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl text-balance">
            {MONTH_LABELS[month]} {year}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Jadwal transaksi keuangan, jatuh tempo, logistik, transaksi berulang, dan hari libur perusahaan
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Link
            href={monthLink(prev)}
            className="inline-flex items-center justify-center px-2.5 sm:px-3 py-2 min-h-11 sm:min-h-9 rounded-lg text-xs sm:text-sm font-medium border border-default bg-surface hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            ← Sebelumnya
          </Link>
          <Link
            href="/kalender"
            className="inline-flex items-center justify-center px-2.5 sm:px-3 py-2 min-h-11 sm:min-h-9 rounded-lg text-xs sm:text-sm font-medium border border-default bg-surface hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            Bulan ini
          </Link>
          <Link
            href={monthLink(next)}
            className="inline-flex items-center justify-center px-2.5 sm:px-3 py-2 min-h-11 sm:min-h-9 rounded-lg text-xs sm:text-sm font-medium border border-default bg-surface hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            Berikutnya →
          </Link>
        </div>
      </div>

      <CalendarBoard
        weeks={serializedWeeks}
        events={events}
        availableKinds={availableKinds}
        canViewArSummary={canSeeAr}
        canViewApSummary={canSeeAp}
        defaultSelectedDayKey={defaultSelectedDayKey}
      />
    </div>
  )
}
