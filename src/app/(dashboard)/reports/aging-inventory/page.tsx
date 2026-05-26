export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/utils/format'
import { Package } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

function getAgeGroup(days: number): string {
  if (days <= 30) return '0-30 hari'
  if (days <= 60) return '31-60 hari'
  if (days <= 90) return '61-90 hari'
  return '90+ hari'
}

export default async function AgingInventoryPage() {
  await requirePermission('view_reports')

  const items = await prisma.item.findMany({
    where: { qtyOnHand: { gt: 0 } },
    include: {
      stockMoves: {
        where: { status: 'posted' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  const today = new Date()
  const data = items.map((item) => {
    const lastMoveDate = item.stockMoves[0]?.createdAt ?? item.createdAt
    const diffTime = today.getTime() - lastMoveDate.getTime()
    const ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      qty: Number(item.qtyOnHand),
      lastMoveDate,
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
    summary[d.ageGroup as keyof typeof summary] += 1
  })

  const totalItems = data.length

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Aging Inventory" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground"><Package size={20} /> Aging Persediaan (Inventory)</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Total Item Aktif</span>
            <span className="text-xl font-bold text-foreground">{totalItems}</span>
          </div>
        </div>
        {Object.entries(summary).map(([group, count]) => (
          <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" key={group}>
            <div className="flex flex-col">
              <span className="text-[0.8125rem] text-muted font-medium">{group}</span>
              <span className="text-xl font-bold text-foreground">{count} item</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Nama Item</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th>Tanggal Pergerakan Terakhir</th>
                <th style={{ textAlign: 'right' }}>Umur (Hari)</th>
                <th>Kelompok Umur</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 px-4 text-muted">Tidak ada persediaan</td></tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.name}</td>
                    <td className="font-mono">{row.sku}</td>
                    <td style={{ textAlign: 'right' }}>{row.qty}</td>
                    <td>{formatDate(row.lastMoveDate, { format: 'short' })}</td>
                    <td style={{ textAlign: 'right' }}>{row.ageDays}</td>
                    <td><span className={`status-badge status-${row.ageDays > 90 ? 'danger' : row.ageDays > 60 ? 'warning' : 'default'}`}>{row.ageGroup}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
