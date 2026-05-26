export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { DollarSign, Receipt, Users, Package, AlertTriangle } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

async function getDashboardData() {
  const [
    totalCustomers,
    totalItems,
    totalInvoices,
    pendingInvoices,
    recentInvoices,
    lowStockItems,
    recentPayments,
    totalRevenue,
  ] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.item.count({ where: { isActive: true } }),
    prisma.salesInvoice.count(),
    prisma.salesInvoice.count({ where: { status: { in: ["posted", "partial"] } } }),
    prisma.salesInvoice.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    prisma.$queryRaw`
      SELECT id, name, qty_on_hand as qtyOnHand, min_stock as minStock
      FROM items
      WHERE is_active = true AND min_stock > 0 AND qty_on_hand <= min_stock AND deleted_at IS NULL
      ORDER BY qty_on_hand ASC
      LIMIT 5
    ` as Promise<{ id: number; name: string; qtyOnHand: number; minStock: number }[]>,
    prisma.salesPayment.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { salesInvoice: { include: { customer: true } } },
    }),
    prisma.salesInvoice.aggregate({
      _sum: { paidAmount: true },
      where: { status: { in: ["posted", "partial", "paid"] } },
    }),
  ])

  return {
    totalCustomers,
    totalItems,
    totalInvoices,
    pendingInvoices,
    recentInvoices,
    lowStockItems,
    recentPayments,
    totalRevenue: Number(totalRevenue._sum.paidAmount || 0),
  }
}

export default async function DashboardPage() {
  await requirePermission("view_dashboard")

  const data = await getDashboardData()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-[0.9375rem] text-muted mt-1">Selamat datang di YaraERP</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md kpi-revenue">
          <div className="text-2xl w-12 h-12 flex items-center justify-center rounded-lg bg-surface-secondary"><DollarSign size={24} /></div>
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Total Revenue</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(data.totalRevenue)}</span>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md kpi-invoices">
          <div className="text-2xl w-12 h-12 flex items-center justify-center rounded-lg bg-surface-secondary"><Receipt size={24} /></div>
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Invoice Pending</span>
            <span className="text-xl font-bold text-foreground">{data.pendingInvoices}</span>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md kpi-customers">
          <div className="text-2xl w-12 h-12 flex items-center justify-center rounded-lg bg-surface-secondary"><Users size={24} /></div>
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Total Customers</span>
            <span className="text-xl font-bold text-foreground">{data.totalCustomers}</span>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md kpi-items">
          <div className="text-2xl w-12 h-12 flex items-center justify-center rounded-lg bg-surface-secondary"><Package size={24} /></div>
          <div className="flex flex-col">
            <span className="text-[0.8125rem] text-muted font-medium">Total Items</span>
            <span className="text-xl font-bold text-foreground">{data.totalItems}</span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5">
        {/* Recent Invoices */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Invoice Terbaru</h2>
            <Link href="/sales/invoices" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>No. Dokumen</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono">{inv.documentNo}</td>
                    <td>{inv.customer.name}</td>
                    <td>{formatCurrency(Number(inv.grandTotal))}</td>
                    <td>
                      <span className={`status-badge status-${inv.status}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground"><AlertTriangle size={16} style={{display:'inline',marginRight:'6px'}} />Stok Menipis</h2>
            <Link href="/master/items" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            {data.lowStockItems.length === 0 ? (
              <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Semua stok aman</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Stok</th>
                    <th>Min</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStockItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="text-danger">{Number(item.qtyOnHand)}</td>
                      <td>{Number(item.minStock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pembayaran Terbaru</h2>
            <Link href="/sales/payments" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>No. Dokumen</th>
                  <th>Customer</th>
                  <th>Jumlah</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((pay) => (
                  <tr key={pay.id}>
                    <td className="font-mono">{pay.documentNo}</td>
                    <td>{pay.salesInvoice?.customer?.name || "-"}</td>
                    <td>{formatCurrency(Number(pay.amount))}</td>
                    <td>{formatDate(pay.paymentDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
