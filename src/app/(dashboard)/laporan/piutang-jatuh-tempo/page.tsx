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

export const metadata: Metadata = { title: "Piutang Jatuh Tempo" }

function getAgeGroup(days: number): string {
  if (days <= 0) return "Jatuh Tempo Hari Ini"
  if (days <= 30) return "1–30 Hari"
  if (days <= 60) return "31–60 Hari"
  if (days <= 90) return "61–90 Hari"
  return "> 90 Hari"
}

export default async function AgingReceivablesPage() {
  await requirePermission('view_reports')

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { notIn: ['draft', 'cancelled'] }, deletedAt: null },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  const now = new Date()
  const rows = invoices
    .map(inv => {
      if (!inv.dueDate) return null
      const outstanding = Number(inv.grandTotal) - Number(inv.paidAmount)
      if (outstanding <= 0) return null
      const dueDate = new Date(inv.dueDate)
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        customer: inv.customer.name,
        invoiceNo: inv.documentNo,
        dueDate,
        daysOverdue: diffDays,
        ageGroup: getAgeGroup(diffDays),
        outstanding,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)

  const agingSummary = new Map<string, { count: number; total: number }>()
  for (const row of rows) {
    const existing = agingSummary.get(row.ageGroup) || { count: 0, total: 0 }
    existing.count++
    existing.total += row.outstanding
    agingSummary.set(row.ageGroup, existing)
  }
  const agingGroups = ['Jatuh Tempo Hari Ini', '1–30 Hari', '31–60 Hari', '61–90 Hari', '> 90 Hari']
    .map(key => ({ key, count: agingSummary.get(key)?.count || 0, total: agingSummary.get(key)?.total || 0 }))

  const period = `Per ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Piutang Jatuh Tempo" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Piutang_Jatuh_Tempo" />
      </div>

      <ReportLetterhead title="Piutang Jatuh Tempo" subtitle="Aging Receivables" periodLabel={period} />
      <ReportNarration text="Laporan Piutang Jatuh Tempo mengelompokkan piutang usaha berdasarkan umur jatuh temponya. Analisis aging piutang membantu mengidentifikasi risiko keterlambatan pembayaran dan mengevaluasi efektivitas penagihan kepada pelanggan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Piutang" value={formatCurrency(totalOutstanding)} />
      </div>

      <ReportSection title="Ringkasan Umur Piutang">
        <DetailTable data-report-table="Ringkasan Umur Piutang">
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

      <ReportSection title="Detail Piutang">
        <DetailTable data-report-table="Detail Piutang">
          <DetailTableHead>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>No. Invoice</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh>Umur</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{r.customer}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{r.invoiceNo}</DetailTableTd>
                <DetailTableTd>{formatDate(r.dueDate)}</DetailTableTd>
                <DetailTableTd>{r.ageGroup}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-primary">{formatAccounting(r.outstanding)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada piutang jatuh tempo</DetailTableTd></DetailTableRow>
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
