export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting, formatDate } from '@/lib/utils/format'
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { RECOGNISED_AP_STATUSES } from "@/lib/reports/document-status"
import { buildPayablesSummary } from "@/lib/reports/payables-summary"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Total Hutang" }

export default async function TotalPayablesPage() {
  await requirePermission('view_reports')

  // Only posted/partial/paid bills are real payables — drafts have no GL entry.
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const now = new Date()
  const summary = buildPayablesSummary(
    bills.map((b) => ({
      vendorId: b.vendorId,
      vendorName: b.vendor.name,
      documentNo: b.documentNo,
      dueDate: b.dueDate,
      grandTotal: Number(b.grandTotal),
      paidAmount: Number(b.paidAmount),
    })),
    now,
  )

  const period = `Per ${now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <ReportPageShell title="Total Hutang" sheet={false} wide actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Total_Hutang" pdfHref={buildReportPdfHref("total-hutang", buildReportPeriodSlug(new Date(), new Date()))} />
      </div>
</>}>




      <ReportLetterhead title="Total Hutang" subtitle="Utang Usaha" periodLabel={period} />
      <ReportNarration text="Laporan Total Hutang menyajikan seluruh utang usaha perusahaan yang belum lunas, termasuk tagihan yang belum memiliki tanggal jatuh tempo. Laporan ini menampilkan total kewajiban beserta rinciannya per pemasok, sehingga arus kas keluar dan jadwal pembayaran kepada pemasok dapat dikelola dengan baik." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Hutang" value={formatCurrency(summary.totalOutstanding)} valueClassName="text-danger" />
        <ReportKpiCard label="Sudah Jatuh Tempo" value={formatCurrency(summary.overdueOutstanding)} valueClassName="text-danger" />
        <ReportKpiCard label="Belum Jatuh Tempo" value={formatCurrency(summary.notYetDueOutstanding)} />
        <ReportKpiCard label="Total Ditagihkan" value={formatCurrency(summary.totalBilled)} />
        <ReportKpiCard label="Sudah Dibayar" value={formatCurrency(summary.totalPaid)} valueClassName="text-success" />
      </div>

      <ReportSection title="Ringkasan Umur Hutang">
        <DetailTable data-report-table="Ringkasan Umur Hutang">
          <DetailTableHead>
            <DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh align="right">Jumlah</DetailTableTh>
            <DetailTableTh align="right">Total (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {summary.aging.map(g => (
              <DetailTableRow key={g.key}>
                <DetailTableTd>{g.key}</DetailTableTd>
                <DetailTableTd align="right">{g.count}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(g.total)}</DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>TOTAL</DetailTableTd>
              <DetailTableTd align="right">{summary.billCount}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(summary.totalOutstanding)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Hutang per Pemasok">
        <DetailTable data-report-table="Hutang per Pemasok">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh align="right">Jumlah Tagihan</DetailTableTh>
            <DetailTableTh align="right">Total Tagihan</DetailTableTh>
            <DetailTableTh align="right">Sudah Dibayar</DetailTableTh>
            <DetailTableTh align="right">Belum Lunas</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {summary.vendors.map(v => (
              <DetailTableRow key={v.vendorId}>
                <DetailTableTd className="font-medium">{v.vendorName}</DetailTableTd>
                <DetailTableTd align="right">{v.billCount}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(v.totalBilled)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(v.totalPaid)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{formatAccounting(v.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {summary.vendors.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada hutang usaha" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {summary.vendors.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{summary.billCount}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(summary.vendors.reduce((s, v) => s + v.totalBilled, 0))}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(summary.vendors.reduce((s, v) => s + v.totalPaid, 0))}</DetailTableTd>
                <DetailTableTd align="right" className="text-danger">{formatAccounting(summary.totalOutstanding)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Rincian Tagihan">
        <DetailTable data-report-table="Rincian Tagihan">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh>No. Tagihan</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh>Umur</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {summary.rows.map((r) => (
              <DetailTableRow key={r.documentNo}>
                <DetailTableTd className="font-medium">{r.vendorName}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{r.documentNo}</DetailTableTd>
                <DetailTableTd>{r.dueDate ? formatDate(r.dueDate) : "Tanpa jatuh tempo"}</DetailTableTd>
                <DetailTableTd>{r.ageBucket}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{formatAccounting(r.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {summary.rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada hutang usaha" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {summary.rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={4}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(summary.totalOutstanding)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
