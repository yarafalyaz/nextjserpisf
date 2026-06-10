export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting, formatDate } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Hutang Jatuh Tempo" }

function getAgeGroup(days: number): string {
  if (days <= 30) return '0-30 hari'
  if (days <= 60) return '31-60 hari'
  if (days <= 90) return '61-90 hari'
  return '90+ hari'
}

export default async function AgingPayablesPage() {
  await requirePermission('view_reports')

  const bills = await prisma.vendorBill.findMany({
    where: {
      status: { notIn: ['paid', 'cancelled', 'draft'] },
      dueDate: { not: null },
    },
    include: { vendor: true },
    orderBy: { dueDate: 'asc' },
  })

  const today = new Date()
  const data = bills.map((bill) => {
    const dueDate = bill.dueDate!
    const diffTime = today.getTime() - dueDate.getTime()
    const ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    return {
      id: bill.id,
      vendorName: bill.vendor.name,
      documentNo: bill.documentNo,
      dueDate: bill.dueDate!,
      amount: Number(bill.grandTotal) - Number(bill.paidAmount),
      ageDays,
      ageGroup: getAgeGroup(ageDays),
    }
  })

  // Summary by age group
  const summary = {
    '0-30 hari': 0,
    '31-60 hari': 0,
    '61-90 hari': 0,
    '90+ hari': 0,
  }
  data.forEach((d) => {
    summary[d.ageGroup as keyof typeof summary] += d.amount
  })

  const totalOutstanding = data.reduce((sum, d) => sum + d.amount, 0)

  const period = `Per ${today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Umur Hutang" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Aging_Payables" />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Umur Hutang" subtitle="Aging Payables" periodLabel={period} />

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5 mb-6 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted-foreground font-medium">Total Belum Lunas</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(totalOutstanding)}</span>
          </div>
        </div>
        {Object.entries(summary).map(([group, amount]) => (
          <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" key={group}>
            <div className="flex flex-col">
              <span className="text-[0.8125rem] text-muted-foreground font-medium">{group}</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(amount)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden no-break">
        <div className="overflow-x-auto">
          <DetailTable data-report-table="Aging Payables">
            <DetailTableHead>
              <DetailTableTh>Pemasok</DetailTableTh>
              <DetailTableTh>No. Tagihan</DetailTableTh>
              <DetailTableTh>Jatuh Tempo</DetailTableTh>
              <DetailTableTh align="right">Sisa Tagihan</DetailTableTh>
              <DetailTableTh align="right">Umur (Hari)</DetailTableTh>
              <DetailTableTh>Kelompok Umur</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {data.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada hutang jatuh tempo</DetailTableTd></DetailTableRow>
              ) : (
                data.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd className="font-medium">{row.vendorName}</DetailTableTd>
                    <DetailTableTd className="font-mono">{row.documentNo}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.dueDate, { format: 'short' })}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(row.amount)}</DetailTableTd>
                    <DetailTableTd align="right">{row.ageDays}</DetailTableTd>
                    <DetailTableTd><span className={`status-badge status-${row.ageDays > 90 ? 'danger' : row.ageDays > 60 ? 'warning' : 'default'}`}>{row.ageGroup}</span></DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}
