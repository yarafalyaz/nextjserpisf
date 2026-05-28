export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { DollarSign, Receipt, Users, Package, AlertTriangle } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { RevenueChart, SalesStatusChart, TopCustomersChart } from "@/components/dashboard/charts"

async function getChartData() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  // Revenue trend - last 6 months
  const revenueRaw = await prisma.$queryRaw<{ month: string; revenue: number }[]>`
    SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COALESCE(SUM(paid_amount), 0) as revenue
    FROM sales_invoices
    WHERE created_at >= ${sixMonthsAgo} AND status IN ('posted', 'partial', 'paid')
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month ASC
  `

  const revenueData = revenueRaw.map((r) => ({
    month: r.month,
    revenue: Number(r.revenue),
  }))

  // Sales by status
  const statusRaw = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT status, COUNT(*) as count FROM sales_invoices GROUP BY status
  `
  const salesByStatus = statusRaw.map((s) => ({
    name: s.status,
    value: Number(s.count),
  }))

  // Top 5 customers by revenue
  const topCustomersRaw = await prisma.$queryRaw<{ name: string; revenue: number }[]>`
    SELECT c.name, COALESCE(SUM(si.paid_amount), 0) as revenue
    FROM sales_invoices si
    JOIN customers c ON si.customer_id = c.id
    WHERE si.status IN ('posted', 'partial', 'paid')
    GROUP BY c.id, c.name
    ORDER BY revenue DESC
    LIMIT 5
  `
  const topCustomers = topCustomersRaw.map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
    revenue: Number(c.revenue),
  }))

  return { revenueData, salesByStatus, topCustomers }
}

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

  const [data, chartData] = await Promise.all([
    getDashboardData(),
    getChartData(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dasbor</h1>
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RevenueChart data={chartData.revenueData} />
        <SalesStatusChart data={chartData.salesByStatus} />
      </div>
      <div className="grid grid-cols-1">
        <TopCustomersChart data={chartData.topCustomers} />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5">
        {/* Recent Invoices */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Invoice Terbaru</h2>
            <Link href="/penjualan/faktur" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Customer</DetailTableTh>
                <DetailTableTh>Total</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {data.recentInvoices.map((inv) => (
                  <DetailTableRow key={inv.id}>
                    <DetailTableTd className="font-mono">{inv.documentNo}</DetailTableTd>
                    <DetailTableTd>{inv.customer.name}</DetailTableTd>
                    <DetailTableTd>{formatCurrency(Number(inv.grandTotal))}</DetailTableTd>
                    <DetailTableTd>
                      <span className={`status-badge status-${inv.status}`}>
                        {inv.status}
                      </span>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground"><AlertTriangle size={16} className="inline mr-1.5" />Stok Menipis</h2>
            <Link href="/master/barang" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            {data.lowStockItems.length === 0 ? (
              <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Semua stok aman</p>
            ) : (
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Item</DetailTableTh>
                  <DetailTableTh>Stok</DetailTableTh>
                  <DetailTableTh>Min</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {data.lowStockItems.map((item) => (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd>{item.name}</DetailTableTd>
                      <DetailTableTd className="text-danger">{Number(item.qtyOnHand)}</DetailTableTd>
                      <DetailTableTd>{Number(item.minStock)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pembayaran Terbaru</h2>
            <Link href="/penjualan/pembayaran" className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Customer</DetailTableTh>
                <DetailTableTh>Jumlah</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {data.recentPayments.map((pay) => (
                  <DetailTableRow key={pay.id}>
                    <DetailTableTd className="font-mono">{pay.documentNo}</DetailTableTd>
                    <DetailTableTd>{pay.salesInvoice?.customer?.name || "-"}</DetailTableTd>
                    <DetailTableTd>{formatCurrency(Number(pay.amount))}</DetailTableTd>
                    <DetailTableTd>{formatDate(pay.paymentDate)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      </div>
    </div>
  )
}
