export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { getSystemSettings } from '@/lib/utils/settings'
import { sumEntriesByAccount } from '@/lib/services/report-aggregation.service'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatCurrency, formatDate } from '@/lib/utils/format'
import { safeAdd, safeSubtract } from '@/lib/utils/math'
import { projectCash, buildPayableProjectionItems, summarizeOpenCommitments } from '@/lib/reports/cash-projection'
import { RECOGNISED_AP_STATUSES, RECOGNISED_AR_STATUSES } from '@/lib/reports/document-status'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from '@/components/ui/detail-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButtons } from '@/components/reports/export-buttons'
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'
import { ReportPeriodFilter } from '@/components/reports/report-period-filter'
import { splitReportSegments } from '@/lib/reports/report-period'

import type { Metadata } from 'next'
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Proyeksi Kas" }

export default async function CashProjectionPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ bulan?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Laporan tanpa periode: segmennya langsung pasangan filter (`/bulan/12`).
  // `?bulan=` lama tetap dibaca.
  const bulanParam = splitReportSegments(segments).filters.bulan ?? search.bulan
  const months = Math.min(24, Math.max(1, Number(bulanParam) || 6))
  const now = new Date()

  const settings = await getSystemSettings()
  const cashAccountIds = [
    settings.cashBankAccountId,
    settings.pettyCashAccountId,
    settings.defaultCashAccountId,
  ].filter((id): id is number => typeof id === 'number' && id > 0)

  const [sums, invoices, bills, openPos, lastPayroll] = await Promise.all([
    sumEntriesByAccount({ date: { lte: now } }),
    prisma.salesInvoice.findMany({
      where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, dueDate: { not: null } },
      select: { dueDate: true, grandTotal: true, paidAmount: true },
    }),
    prisma.vendorBill.findMany({
      where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null, dueDate: { not: null } },
      select: { dueDate: true, grandTotal: true, withholdingAmount: true, paidAmount: true },
    }),
    // F-2026-10-20-48(b): komitmen belum tertagih (memo, bukan proyeksi).
    prisma.purchaseOrder.findMany({
      where: { status: { in: ['ordered', 'partial_received'] }, deletedAt: null },
      select: { status: true, items: { select: { qty: true, receivedQty: true, unitPrice: true } } },
    }),
    prisma.payroll.findFirst({
      where: { status: { not: 'cancelled' } },
      orderBy: { period: 'desc' },
      select: { period: true },
    }),
  ])

  const opening = cashAccountIds.length
    ? cashAccountIds.reduce((total, id) => {
        const sum = sums.get(id)
        if (!sum) return total
        return safeAdd(total, safeSubtract(sum.debit, sum.credit, 2), 2)
      }, 0)
    : 0

  const receivables = invoices
    .map((inv) => ({ dueDate: inv.dueDate as Date, amount: safeSubtract(inv.grandTotal, inv.paidAmount, 2) }))
    .filter((row) => row.amount > 0)
  // Sisa utang NETO potongan PPh (grandTotal - withholding - paid), selaras
  // aging/payables-summary; bruto menaikkan proyeksi kas keluar tagihan ber-PPh.
  const payables = buildPayableProjectionItems(bills)

  const payrollNet = lastPayroll
    ? await prisma.payroll.aggregate({
        where: { period: lastPayroll.period, status: { not: 'cancelled' } },
        _sum: { netSalary: true },
      })
    : null
  const commitments = summarizeOpenCommitments({
    purchaseOrders: openPos.map((po) => ({
      status: po.status,
      items: po.items.map((i) => ({ qty: Number(i.qty), receivedQty: Number(i.receivedQty), unitPrice: Number(i.unitPrice) })),
    })),
    payrollPeriod: lastPayroll?.period ?? null,
    payrollNetTotal: Number(payrollNet?._sum.netSalary ?? 0),
  })

  const rows = projectCash(opening, now, months, receivables, payables)

  const totalInflow = rows.reduce((sum, row) => safeAdd(sum, row.inflow, 2), 0)
  const totalOutflow = rows.reduce((sum, row) => safeAdd(sum, row.outflow, 2), 0)
  const closing = rows.length > 0 ? rows[rows.length - 1].closing : opening
  const periodLabel = `${months} bulan ke depan — per ${formatDate(now)}`

  return (
    <ReportPageShell title="Proyeksi Kas" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/proyeksi-kas"
        mode="none"
        defaultStartDate=""
        numberField={{ param: "bulan", label: "Jumlah Bulan", value: String(months), min: 1, max: 24 }}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Proyeksi_Kas" />
      </div>
</>}>






      <ReportLetterhead title="Proyeksi Kas" subtitle="Proyeksi Arus Kas" periodLabel={periodLabel} />
      <ReportNarration text="Proyeksi Kas memperkirakan posisi kas ke depan dari saldo kas/bank saat ini ditambah tagihan penjualan yang belum dibayar (masuk) dan tagihan pemasok yang belum dibayar (keluar), dikelompokkan menurut tanggal jatuh tempo. Dokumen tanpa tanggal jatuh tempo tidak ikut diproyeksikan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Kas Saat Ini" value={formatCurrency(opening)} />
        <ReportKpiCard label="Proyeksi Masuk" value={formatCurrency(totalInflow)} valueClassName="text-success" />
        <ReportKpiCard label="Proyeksi Keluar" value={formatCurrency(totalOutflow)} valueClassName="text-danger" />
        <ReportKpiCard
          label="Saldo Akhir Proyeksi"
          value={formatCurrency(closing)}
          valueClassName={closing >= 0 ? 'text-success' : 'text-danger'}
        />
      </div>

      <ReportSection title="Komitmen Belum Tertagih (Memo)">
        <p className="text-sm text-muted-foreground">
          Memo terpisah — tidak mengurangi saldo proyeksi di atas: PO terbuka belum menjadi tagihan dan gaji periode berikut belum jatuh tempo dokumen.
        </p>
        <DetailTable data-report-table="Komitmen Belum Tertagih">
          <DetailTableBody>
            <DetailTableRow>
              <DetailTableTd>PO terbuka ({commitments.openPurchaseOrderCount} dokumen, sisa qty belum diterima)</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(commitments.openPurchaseAmount, { zeroDash: false })}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd>Estimasi gaji bersih periode berikut{commitments.payrollPeriod ? ` (basis ${commitments.payrollPeriod})` : ''}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(commitments.estimatedPayrollAmount, { zeroDash: false })}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-semibold">Total komitmen memo</DetailTableTd>
              <DetailTableTd align="right" className="font-semibold">{formatAccounting(commitments.total, { zeroDash: false })}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Proyeksi Kas per Bulan">
        <DetailTable data-report-table="Proyeksi Kas">
          <DetailTableHead>
            <DetailTableTh>Bulan</DetailTableTh>
            <DetailTableTh align="right">Masuk</DetailTableTh>
            <DetailTableTh align="right">Keluar</DetailTableTh>
            <DetailTableTh align="right">Bersih</DetailTableTh>
            <DetailTableTh align="right">Saldo Proyeksi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.month}>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd align="right" className="text-success">{formatAccounting(row.inflow, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right" className="text-danger">{formatAccounting(row.outflow, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right" className={row.net >= 0 ? 'text-success' : 'text-danger'}>{formatAccounting(row.net, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.closing, { zeroDash: false })}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada data untuk diproyeksikan" className="py-0" /></DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportNarration text={`Saldo kas dihitung dari akun kas/bank yang dipetakan pada Pengaturan → Mapping Akun. Bila akun kas belum dipetakan, saldo awal dianggap nol.`} />
    </ReportPageShell>
  )
}
