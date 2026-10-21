export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { safeAdd } from "@/lib/utils/math"
import { averagePaymentDays, buildCustomerCreditExposure, buildCustomerReceivables } from "@/lib/reports/customer-receivables"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Piutang per Pelanggan" }

/**
 * Piutang per pelanggan: saldo belum lunas (posisi per akhir periode), umur
 * jatuh tempo, limit & sisa kredit, plus rata-rata hari bayar (DSO) yang
 * dihitung dari pembayaran pada periode terpilih.
 */
export default async function CustomerReceivablesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  const [invoices, payments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
        date: { lte: endDate },
      },
      select: {
        customerId: true,
        grandTotal: true,
        paidAmount: true,
        dueDate: true,
        customer: { select: { name: true, creditLimit: true } },
      },
    }),
    prisma.salesPayment.findMany({
      where: { paymentDate: { gte: startDate, lte: endDate } },
      select: {
        amount: true,
        paymentDate: true,
        salesInvoice: { select: { customerId: true, date: true } },
      },
    }),
  ])

  const now = new Date()
  const buckets = new Map<number, { customerId: number; customerName: string; creditLimit: number; outstanding: number; overdue: number; invoiceCount: number }>()

  for (const invoice of invoices) {
    const outstanding = receivableOutstanding(invoice.grandTotal, invoice.paidAmount)
    if (outstanding <= 0) continue
    const bucket = buckets.get(invoice.customerId) ?? {
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      creditLimit: Number(invoice.customer.creditLimit ?? 0),
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
    }
    bucket.outstanding = safeAdd(bucket.outstanding, outstanding, 2)
    if (invoice.dueDate && invoice.dueDate < now) bucket.overdue = safeAdd(bucket.overdue, outstanding, 2)
    bucket.invoiceCount += 1
    buckets.set(invoice.customerId, bucket)
  }

  // Rata-rata hari bayar per pelanggan (weighted by amount), hanya dari
  // pembayaran yang fakturnya bisa ditelusuri.
  const paymentsByCustomer = new Map<number, { invoiceDate: Date; paymentDate: Date; amount: number }[]>()
  for (const payment of payments) {
    const customerId = payment.salesInvoice?.customerId
    if (!customerId) continue
    const list = paymentsByCustomer.get(customerId) ?? []
    list.push({
      invoiceDate: payment.salesInvoice.date,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
    })
    paymentsByCustomer.set(customerId, list)
  }

  // F-2026-10-21-017 lapis aman: paparan kredit = piutang + SO terbuka
  // (confirmed/processing/completed) dikurangi porsi yang sudah jadi
  // invoice recognised. Advisory saja, tidak menahan dokumen.
  const openOrders = await prisma.salesOrder.findMany({
    where: { status: { in: ["confirmed", "processing", "completed"] }, deletedAt: null },
    select: { id: true, customerId: true, grandTotal: true },
  })
  const invoicedByOrder = new Map<number, number>()
  if (openOrders.length > 0) {
    const orderInvoices = await prisma.salesInvoice.findMany({
      where: {
        salesOrderId: { in: openOrders.map((o) => o.id) },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { salesOrderId: true, grandTotal: true },
    })
    for (const inv of orderInvoices) {
      if (inv.salesOrderId == null) continue
      invoicedByOrder.set(inv.salesOrderId, safeAdd(invoicedByOrder.get(inv.salesOrderId) ?? 0, inv.grandTotal, 2))
    }
  }
  const openOrderByCustomer = new Map<number, number>()
  for (const order of openOrders) {
    const open = Math.max(0, receivableOutstanding(order.grandTotal, invoicedByOrder.get(order.id) ?? 0))
    if (open <= 0) continue
    openOrderByCustomer.set(order.customerId, safeAdd(openOrderByCustomer.get(order.customerId) ?? 0, open, 2))
  }
  // F-2026-10-21-017: DP confirmed mengurangi paparan (kas sudah diterima di
  // muka). Satu query massal; hanya status confirmed (draft/cancelled tak ikut).
  const confirmedDpByCustomer = new Map<number, number>()
  const confirmedDps = await prisma.downPayment.findMany({
    where: { status: "confirmed" },
    select: { customerId: true, amount: true },
  })
  for (const dp of confirmedDps) {
    confirmedDpByCustomer.set(dp.customerId, safeAdd(confirmedDpByCustomer.get(dp.customerId) ?? 0, dp.amount, 2))
  }
  const exposureByCustomer = new Map(
    buildCustomerCreditExposure(
      [...buckets.values()].map((b) => ({
        ...b,
        openOrderAmount: openOrderByCustomer.get(b.customerId) ?? 0,
        confirmedDownPayment: confirmedDpByCustomer.get(b.customerId) ?? 0,
      })),
    ).map((r) => [r.customerId, r]),
  )

  const rows = buildCustomerReceivables([...buckets.values()]).map((row) => ({
    ...row,
    avgPaymentDays: averagePaymentDays(paymentsByCustomer.get(row.customerId) ?? []),
  }))

  const totalOutstanding = rows.reduce((sum, row) => sum + row.outstanding, 0)
  const totalOverdue = rows.reduce((sum, row) => sum + row.overdue, 0)
  const totalCreditLimit = rows.reduce((sum, row) => sum + row.creditLimit, 0)
  const weightedDays = rows.reduce((sum, row) => sum + (row.avgPaymentDays ?? 0) * row.outstanding, 0)
  const portfolioDso = totalOutstanding > 0 ? weightedDays / totalOutstanding : null
  const periodLabel = `Pembayaran ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <ReportPageShell title="Piutang per Pelanggan" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/piutang-pelanggan"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Piutang_per_Pelanggan" pdfHref={buildReportPdfHref("piutang-pelanggan", period.slug)} /></div>
</>}>



      <ReportLetterhead title="Piutang per Pelanggan" subtitle="Umur Piutang, Limit Kredit & Rata-rata Pembayaran" periodLabel={periodLabel} />
      <ReportNarration text="Laporan ini menampilkan saldo piutang belum lunas setiap pelanggan beserta umur jatuh temponya, pemakaian limit kredit, dan rata-rata hari bayar (DSO) yang dihitung dari pembayaran pada periode terpilih. Pelanggan tanpa limit akan menampilkan tanda '–' pada kolom pemakaian karena persentasenya tidak bermakna." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Piutang" value={formatCurrency(totalOutstanding)} valueClassName="text-primary" />
        <ReportKpiCard label="Sudah Jatuh Tempo" value={formatCurrency(totalOverdue)} valueClassName="text-danger" />
        <ReportKpiCard label="Total Limit Kredit" value={formatCurrency(totalCreditLimit)} />
        <ReportKpiCard label="Rata-rata Hari Bayar" value={portfolioDso === null ? "–" : `${portfolioDso.toFixed(1)} hari`} />
      </div>

      <ReportSection title={`Piutang per Pelanggan (${rows.length} pelanggan)`}>
        <DetailTable data-report-table="Piutang per Pelanggan">
          <DetailTableHead>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh align="right">Jumlah Faktur</DetailTableTh>
            <DetailTableTh align="right">Limit Kredit</DetailTableTh>
            <DetailTableTh align="right">Piutang</DetailTableTh>
            <DetailTableTh align="right">Jatuh Tempo</DetailTableTh>
            <DetailTableTh align="right">Sisa Kredit</DetailTableTh>
            <DetailTableTh align="right">Pemakaian</DetailTableTh>
            <DetailTableTh align="right">SO Terbuka</DetailTableTh>
            <DetailTableTh align="right">Paparan Kredit</DetailTableTh>
            <DetailTableTh align="right">Status Kredit</DetailTableTh>
            <DetailTableTh align="right">Rata-rata Bayar (hari)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.customerId}>
                <DetailTableTd className="font-medium">{row.customerName}</DetailTableTd>
                <DetailTableTd align="right">{row.invoiceCount.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.creditLimit)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-primary">{formatAccounting(row.outstanding)}</DetailTableTd>
                <DetailTableTd align="right" className={row.overdue > 0 ? "text-danger" : undefined}>{formatAccounting(row.overdue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.remainingCredit)}</DetailTableTd>
                <DetailTableTd align="right" className={row.utilization !== null && row.utilization > 100 ? "text-danger" : undefined}>
                  {row.utilization === null ? "–" : `${row.utilization.toFixed(1)}%`}
                </DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposureByCustomer.get(row.customerId)?.openOrderAmount ?? 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposureByCustomer.get(row.customerId)?.exposure ?? row.outstanding)}</DetailTableTd>
                <DetailTableTd align="right">{({ unset: "Limit belum diatur", ok: "Aman", warning: "Mendekati batas", over: "Lewat batas" } as const)[exposureByCustomer.get(row.customerId)?.status ?? "unset"]}</DetailTableTd>
                <DetailTableTd align="right">{row.avgPaymentDays === null ? "–" : row.avgPaymentDays.toLocaleString('id-ID')}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={11} className="text-center text-muted-foreground py-6">Tidak ada piutang belum lunas</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalCreditLimit)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOverdue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalCreditLimit - totalOutstanding)}</DetailTableTd>
                <DetailTableTd align="right">
                  {totalCreditLimit > 0 ? `${((totalOutstanding / totalCreditLimit) * 100).toFixed(1)}%` : "–"}
                </DetailTableTd>
                <DetailTableTd align="right">{portfolioDso === null ? "–" : portfolioDso.toFixed(1)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
