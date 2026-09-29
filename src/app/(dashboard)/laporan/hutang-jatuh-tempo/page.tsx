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

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Hutang Jatuh Tempo" }

export default async function AgingPayablesPage() {
  await requirePermission('view_reports')

  const bills = await prisma.vendorBill.findMany({
    where: { status: { notIn: ['draft', 'cancelled'] }, deletedAt: null },
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
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        vendor: bill.vendor.name,
        billNo: bill.documentNo,
        dueDate,
        daysOverdue: diffDays,
        outstanding,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
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
      <ReportNarration text="Laporan Utang Jatuh Tempo mengelompokkan utang usaha berdasarkan umur jatuh temponya. Informasi ini penting untuk mengelola jadwal pembayaran, menjaga hubungan baik dengan pemasok, dan mengoptimalkan arus kas perusahaan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Hutang" value={formatCurrency(totalOutstanding)} />
      </div>

      <ReportSection title="Detail Hutang">
        <DetailTable data-report-table="Detail Hutang">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh>No. Tagihan</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{r.vendor}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{r.billNo}</DetailTableTd>
                <DetailTableTd>{formatDate(r.dueDate)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-danger">{formatAccounting(r.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6">Tidak ada hutang jatuh tempo</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
