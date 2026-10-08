export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting, formatDate } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { RECOGNISED_AP_STATUSES } from "@/lib/reports/document-status"
import { AGING_BUCKETS, agingBucket, daysOverdue } from "@/lib/reports/aging"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Hutang Jatuh Tempo" }

export default async function AgingPayablesPage() {
  await requirePermission('view_reports')

  // Only posted/partial/paid bills are real payables.
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const now = new Date()
  const rows = bills
    .map(bill => {
      if (!bill.dueDate) return null
      const outstanding = Number(bill.grandTotal) - Number(bill.paidAmount)
      if (outstanding <= 0) return null
      const dueDate = new Date(bill.dueDate)
      const overdue = daysOverdue(dueDate, now)
      return {
        vendor: bill.vendor.name,
        billNo: bill.documentNo,
        dueDate,
        overdueDays: overdue,
        ageGroup: agingBucket(overdue),
        outstanding,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.overdueDays - a.overdueDays)

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)

  const agingSummary = new Map<string, { count: number; total: number }>()
  for (const row of rows) {
    const existing = agingSummary.get(row.ageGroup) || { count: 0, total: 0 }
    existing.count++
    existing.total += row.outstanding
    agingSummary.set(row.ageGroup, existing)
  }
  const agingGroups = AGING_BUCKETS.map(key => ({ key, count: agingSummary.get(key)?.count || 0, total: agingSummary.get(key)?.total || 0 }))
  const period = `Per ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Hutang Jatuh Tempo" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Hutang_Jatuh_Tempo" />
      </div>

      <ReportLetterhead title="Hutang Jatuh Tempo" subtitle="Aging Payables" periodLabel={period} />
      <ReportNarration text="Laporan Utang Jatuh Tempo mengelompokkan utang usaha berdasarkan umur jatuh temponya. Informasi ini penting untuk mengelola jadwal pembayaran, menjaga hubungan baik dengan vendor, dan mengoptimalkan arus kas perusahaan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Hutang" value={formatCurrency(totalOutstanding)} />
      </div>

      <ReportSection title="Ringkasan Umur Hutang">
        <DetailTable data-report-table="Ringkasan Umur Hutang">
          <DetailTableHead>
            <DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh align="right">Jumlah</DetailTableTh>
            <DetailTableTh align="right">Total (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {agingGroups.map(g => (
              <DetailTableRow key={g.key}>
                <DetailTableTd>{g.key}</DetailTableTd>
                <DetailTableTd align="right">{g.count}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(g.total)}</DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>TOTAL</DetailTableTd>
              <DetailTableTd align="right">{rows.length}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Detail Hutang">
        <DetailTable data-report-table="Detail Hutang">
          <DetailTableHead>
            <DetailTableTh>Vendor</DetailTableTh>
            <DetailTableTh>No. Tagihan</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh>Umur</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{r.vendor}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{r.billNo}</DetailTableTd>
                <DetailTableTd>{formatDate(r.dueDate)}</DetailTableTd>
                <DetailTableTd>{r.ageGroup}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{formatAccounting(r.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada hutang jatuh tempo</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={4}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
