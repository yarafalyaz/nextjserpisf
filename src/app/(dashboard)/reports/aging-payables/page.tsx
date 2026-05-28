export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { FileText } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      status: { not: 'paid' },
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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Aging Payables" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground"><FileText size={20} /> Aging Hutang (Payables)</h1>
        <ExportButtons title="Aging_Payables" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Total Outstanding</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(totalOutstanding)}</span>
          </div>
        </div>
        {Object.entries(summary).map(([group, amount]) => (
          <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" key={group}>
            <div className="flex flex-col">
              <span className="text-[0.8125rem] text-muted font-medium">{group}</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(amount)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Vendor</DetailTableTh>
              <DetailTableTh>No. Bill</DetailTableTh>
              <DetailTableTh>Jatuh Tempo</DetailTableTh>
              <DetailTableTh align="right">Sisa Tagihan</DetailTableTh>
              <DetailTableTh align="right">Umur (Hari)</DetailTableTh>
              <DetailTableTh>Kelompok Umur</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {data.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 text-muted">Tidak ada hutang jatuh tempo</DetailTableTd></DetailTableRow>
              ) : (
                data.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd className="font-medium">{row.vendorName}</DetailTableTd>
                    <DetailTableTd className="font-mono">{row.documentNo}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.dueDate, { format: 'short' })}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
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
