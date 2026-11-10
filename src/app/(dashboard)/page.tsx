export const dynamic = "force-dynamic"

import { auth } from "@/lib/auth/auth"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Car, FilePlus, Plus, TrendingUp } from "@/components/ui/fontawesome-icons"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { prisma } from "@/lib/db/prisma"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { loadOpenReceivablesTotal } from "@/lib/reports/return-credit"
import { isReversedPayment } from "@/lib/finance/payment-status"
import { StatusChip } from "@/components/ui/status-chip"
import { NotificationsWidget } from "@/components/dashboard/notifications-widget"
import { RecentInvoicesTable } from "@/components/dashboard/recent-invoices-table"
import { SectionCards } from "@/components/dashboard/section-cards"
import {
  ProjectPipelineChart,
  RevenueChart,
  SalesStatusChart,
  TopCustomersChart,
} from "@/components/lazy/dashboard-charts"
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table"
import EmployeeDashboard from "@/components/dashboard/employee-dashboard"
import WorkshopDashboard from "@/components/dashboard/workshop-dashboard"
import PurchaseDashboard from "@/components/dashboard/purchase-dashboard"
import WarehouseDashboard from "@/components/dashboard/warehouse-dashboard"
import FinanceDashboard from "@/components/dashboard/finance-dashboard"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dasbor" }

const DONE_STATES = ["completed", "cancelled", "done", "closed"]
const STAGE_DONE = ["completed", "skipped"]

type ActiveProject = {
  id: number
  name: string
  endDate: Date | null
  customer: { name: string }
  customerVehicle: {
    plateNumber: string | null
  } | null
  stages: { name: string; sortOrder: number; status: string }[]
}

async function getCharts() {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)

  const [revenueRaw, statusRaw, pipelineRaw, topCustomersRaw] = await Promise.all([
    prisma.$queryRaw<
      { date: string; lunas: number; tagihan: number }[]
    >`
      SELECT DATE_FORMAT(date, '%Y-%m-%d') as date,
             COALESCE(SUM(paid_amount), 0) as lunas,
             COALESCE(SUM(grand_total), 0) as tagihan
      FROM sales_invoices
      WHERE date >= ${ninetyDaysAgo}
        AND status IN ('posted', 'partial', 'paid')
        AND deleted_at IS NULL
      GROUP BY DATE_FORMAT(date, '%Y-%m-%d')
      ORDER BY date ASC
    `,
    prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT status, COUNT(*) as count
      FROM sales_invoices
      WHERE deleted_at IS NULL
      GROUP BY status
    `,
    prisma.$queryRaw<
      { stage: string; count: bigint }[]
    >`
      SELECT ps.name as stage, COUNT(DISTINCT ps.project_id) as count
      FROM project_stages ps
      JOIN projects p ON ps.project_id = p.id
      WHERE p.status NOT IN ('completed', 'cancelled')
        AND ps.status = 'in_progress'
      GROUP BY ps.name
      ORDER BY MIN(ps.sort_order) ASC
    `,
    prisma.$queryRaw<{ name: string; revenue: number }[]>`
      SELECT c.name as name, COALESCE(SUM(si.grand_total), 0) as revenue
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      WHERE si.deleted_at IS NULL
        AND si.status IN ('posted', 'partial', 'paid')
        AND YEAR(si.date) = YEAR(CURDATE())
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT 5
    `,
  ])

  return {
    revenueData: revenueRaw.map((row) => ({
      date: row.date,
      lunas: Number(row.lunas),
      tagihan: Number(row.tagihan),
    })),
    salesByStatus: statusRaw.map((row) => ({
      name: row.status,
      value: Number(row.count),
    })),
    pipeline: pipelineRaw.map((row) => ({
      stage: row.stage,
      count: Number(row.count),
    })),
    topCustomers: topCustomersRaw.map((row) => ({
      name: row.name,
      revenue: Number(row.revenue),
    })),
  }
}

async function getDashboardData() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const now = new Date()

  const [
    activeProjects,
    completedThisMonth,
    overdueProjects,
    workshopList,
    receivablesAgg,
    revenueAgg,
    recentPayments,
    lowStockItems,
    totalCustomers,
    recentInvoices,
  ] = await Promise.all([
    prisma.project.count({
      where: { status: { notIn: DONE_STATES }, customerVehicleId: { not: null } },
    }),
    prisma.project.count({
      where: {
        status: "completed",
        endDate: { gte: startOfMonth },
      },
    }),
    prisma.project.count({
      where: { status: { notIn: DONE_STATES }, endDate: { lt: now } },
    }),
    prisma.project.findMany({
      where: { status: { notIn: DONE_STATES }, customerVehicleId: { not: null } },
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        slug: true,
        name: true,
        endDate: true,
        customer: { select: { name: true } },
        customerVehicle: {
          select: { plateNumber: true },
        },
        stages: {
          select: { name: true, sortOrder: true, status: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }) as Promise<ActiveProject[]>,
    loadOpenReceivablesTotal(),
    prisma.salesInvoice.aggregate({
      _sum: { paidAmount: true },
      where: { status: { in: ["posted", "partial", "paid"] } },
    }),
    prisma.salesPayment.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { salesInvoice: { include: { customer: true } } },
    }),
    prisma.$queryRaw<
      { id: number; name: string; qtyOnHand: number; minStock: number }[]
    >`
      SELECT id, name, qty_on_hand as qtyOnHand, min_stock as minStock
      FROM items
      WHERE is_active = true
        AND min_stock > 0
        AND qty_on_hand <= min_stock
        AND deleted_at IS NULL
      ORDER BY qty_on_hand ASC
      LIMIT 6
    `,
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.salesInvoice.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      where: { deletedAt: null },
      include: { customer: true },
    }),
  ])

  const cars = workshopList.map((project) => {
    const totalStages = project.stages.length
    const doneStages = project.stages.filter((stage) =>
      STAGE_DONE.includes(stage.status)
    ).length
    const progress =
      totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0
    const currentStage =
      project.stages.find((stage) => !STAGE_DONE.includes(stage.status))
        ?.name ?? "Selesai"

    return {
      id: project.id,
      name: project.name,
      plate: project.customerVehicle?.plateNumber || "-",
      customer: project.customer?.name || "-",
      currentStage,
      progress,
      endDate: project.endDate,
      overdue: !!project.endDate && new Date(project.endDate) < now,
    }
  })

  const invoiceRows = recentInvoices.map((invoice) => ({
    id: invoice.id,
    slug: invoice.slug,
    documentNo: salesInvoiceLabel(invoice),
    customerName: invoice.customer.name,
    grandTotal: Number(invoice.grandTotal),
    paidAmount: Number(invoice.paidAmount),
    status: invoice.status,
    date:
      invoice.date instanceof Date
        ? invoice.date.toISOString()
        : String(invoice.date),
  }))

  return {
    activeProjects,
    completedThisMonth,
    overdueProjects,
    cars,
    receivables: Number(receivablesAgg || 0),
    totalRevenue: Number(revenueAgg._sum.paidAmount || 0),
    recentPayments,
    lowStockItems,
    totalCustomers,
    invoiceRows,
  }
}

export default async function DashboardPage() {
  const session = await auth()
  const roles = (session?.user as { roles?: string[] })?.roles ?? []

  // Role-based dashboard routing
  const isAdmin = roles.includes("super_admin") || roles.includes("admin")
  if (!isAdmin) {
    if (roles.includes("kepala_bengkel")) return <WorkshopDashboard />
    if (roles.includes("purchasing")) return <PurchaseDashboard />
    if (roles.includes("warehouse")) return <WarehouseDashboard user={{ id: String(session?.user?.id ?? ""), roles }} />
    if (roles.includes("finance")) return <FinanceDashboard />
    return <EmployeeDashboard />
  }

  await requirePermission("view_dashboard")

  const [data, charts] = await Promise.all([getDashboardData(), getCharts()])

  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div data-dashboard-page="true" className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5">
          {/* Executive Header & Quick Actions */}
          <div className="flex flex-col justify-between gap-3 px-4 sm:flex-row sm:items-center lg:px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Dasbor Operasional
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {today} · Ringkasan finansial, pengerjaan bengkel, dan inventaris real-time
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs sm:min-h-8 sm:h-8">
                <Link href="/laporan/laba-rugi">
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                  Laporan
                </Link>
              </Button>
              <CanCreate permission="create_sales_invoices">
                <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs sm:min-h-8 sm:h-8">
                  <Link href="/penjualan/faktur/tambah">
                    <FilePlus className="size-3.5" aria-hidden="true" />
                    Buat Faktur
                  </Link>
                </Button>
              </CanCreate>
              <CanCreate permission="create_projects">
                <Button asChild size="sm" className="min-h-11 gap-1.5 text-xs sm:min-h-8 sm:h-8">
                  <Link href="/proyek/tambah">
                    <Plus className="size-3.5" aria-hidden="true" />
                    Proyek Baru
                  </Link>
                </Button>
              </CanCreate>
            </div>
          </div>

          {/* Row 1: Unified KPI Strip */}
          <SectionCards
            totalRevenue={formatCurrencyExact(data.totalRevenue)}
            activeProjects={data.activeProjects}
            completedThisMonth={data.completedThisMonth}
            overdueProjects={data.overdueProjects}
            receivables={formatCurrencyExact(data.receivables)}
            totalCustomers={data.totalCustomers}
          />

          {/* Row 2: Revenue Trend (2/3) + Invoice Status Distribution (1/3) */}
          <div className="grid grid-cols-1 items-stretch gap-4 px-4 xl:grid-cols-3 lg:px-6">
            <div className="h-full xl:col-span-2">
              <RevenueChart data={charts.revenueData} />
            </div>
            <SalesStatusChart data={charts.salesByStatus} />
          </div>

          {/* Row 3: Active Workshop Pipeline (1/2) + Top Customers (1/2) */}
          <div className="grid grid-cols-1 items-stretch gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <ProjectPipelineChart data={charts.pipeline} />
            <TopCustomersChart data={charts.topCustomers} />
          </div>

          {/* Row 4: Workshop Floor Tracker (2/3) + Low Stock Watchlist (1/3) */}
          <div className="grid grid-cols-1 items-stretch gap-4 px-4 xl:grid-cols-3 lg:px-6">
            <Card className="min-w-0 gap-0 overflow-x-clip py-0 xl:col-span-2">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <Car className="size-4 text-muted-foreground" />
                  Mobil di Bengkel
                </CardTitle>
                <CardDescription>
                  Proyek kendaraan aktif dan progres tahap pengerjaan saat ini
                </CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/proyek">
                      Semua Proyek <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="min-w-0 p-0">
                {/* Mobile cards — fallback at 390px */}
                <div className="border-t md:hidden">
                  {data.cars.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Belum ada mobil yang sedang dikerjakan
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {data.cars.map((car) => (
                        <li
                          key={car.id}
                          className="flex min-w-0 flex-col gap-2.5 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="inline-flex items-center rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground">
                                  {car.plate}
                                </span>
                                {car.overdue ? (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 border-red-200/80 bg-red-50 text-[10px] text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                  >
                                    Lewat Target
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 min-w-0 truncate break-words text-sm font-medium text-foreground">
                                {car.customer}
                              </p>
                              <p className="min-w-0 truncate break-words text-xs text-muted-foreground">
                                {car.name}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="max-w-[120px] shrink-0 truncate"
                              title={car.currentStage}
                            >
                              {car.currentStage}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${car.progress}%` }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {car.progress}%
                            </span>
                          </div>
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="min-w-0 text-xs">
                              {car.endDate ? (
                                car.overdue ? (
                                  <Badge
                                    variant="outline"
                                    className="border-red-200/80 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                  >
                                    {formatDate(car.endDate, {
                                      format: "short",
                                    })}
                                  </Badge>
                                ) : (
                                  <span className="tabular-nums text-muted-foreground">
                                    Target{" "}
                                    {formatDate(car.endDate, {
                                      format: "short",
                                    })}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                            <Link
                              href={entityHref("/proyek", car)}
                              className="shrink-0 text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                              Detail →
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto border-t md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4 lg:px-5">Plat</TableHead>
                        <TableHead className="px-4 lg:px-5">
                          Pelanggan
                        </TableHead>
                        <TableHead className="hidden px-4 sm:table-cell lg:px-5">
                          Pekerjaan
                        </TableHead>
                        <TableHead className="px-4 lg:px-5">Tahap</TableHead>
                        <TableHead className="w-[170px] px-4 lg:px-5">
                          Progres
                        </TableHead>
                        <TableHead className="hidden px-4 sm:table-cell lg:px-5">
                          Target
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cars.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-10 text-center text-muted-foreground"
                          >
                            Belum ada mobil yang sedang dikerjakan
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.cars.map((car) => (
                          <TableRow key={car.id}>
                            <TableCell className="px-4 lg:px-5">
                              <Link
                                href={entityHref("/proyek", car)}
                                className="inline-flex items-center rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
                              >
                                {car.plate}
                              </Link>
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate px-4 font-medium lg:px-5">
                              {car.customer}
                            </TableCell>
                            <TableCell className="hidden max-w-[220px] truncate px-4 text-muted-foreground sm:table-cell lg:px-5">
                              {car.name}
                            </TableCell>
                            <TableCell className="px-4 lg:px-5">
                              <Badge variant="outline">
                                {car.currentStage}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 lg:px-5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{ width: `${car.progress}%` }}
                                  />
                                </div>
                                <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                  {car.progress}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden px-4 sm:table-cell lg:px-5">
                              {car.endDate ? (
                                car.overdue ? (
                                  <Badge
                                    variant="outline"
                                    className="border-red-200/80 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                  >
                                    {formatDate(car.endDate, {
                                      format: "short",
                                    })}
                                  </Badge>
                                ) : (
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {formatDate(car.endDate, {
                                      format: "short",
                                    })}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Stok Menipis
                </CardTitle>
                <CardDescription>Barang di bawah batas minimum stok</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/master/barang/stokmenipis">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="border-t p-0">
                {data.lowStockItems.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Semua stok aman
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.lowStockItems.map((item) => {
                      const onHand = Number(item.qtyOnHand)
                      const min = Number(item.minStock)
                      const isEmpty = onHand <= 0
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-5 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Minimum: <span className="tabular-nums">{min}</span> unit
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              isEmpty
                                ? "shrink-0 border-red-200/80 bg-red-50 font-mono tabular-nums text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                : "shrink-0 border-amber-200/80 bg-amber-50 font-mono tabular-nums text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                            }
                          >
                            {onHand} / {min}
                          </Badge>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 5: Recent Invoices Table */}
          <div className="px-4 lg:px-6">
            <RecentInvoicesTable data={data.invoiceRows} />
          </div>

          {/* Row 6: Recent Payments (1/2) + Operational Signals & Activity (1/2) */}
          <div className="grid grid-cols-1 items-stretch gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <Card className="min-w-0 gap-0 overflow-x-clip py-0">
              <CardHeader className="py-4">
                <CardTitle>Pembayaran Terbaru</CardTitle>
                <CardDescription>
                  6 penerimaan pembayaran faktur terakhir
                </CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/penjualan/pembayaran">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="min-w-0 p-0">
                {/* Mobile cards — fallback at 390px */}
                <div className="border-t md:hidden">
                  {data.recentPayments.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Belum ada pembayaran
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {data.recentPayments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex min-w-0 flex-col gap-1.5 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="min-w-0 truncate break-all font-mono text-xs font-medium text-foreground">
                              {payment.documentNo}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {formatDate(payment.paymentDate, {
                                format: "short",
                              })}
                            </span>
                          </div>
                          <p className="min-w-0 truncate break-words text-sm text-foreground">
                            {payment.salesInvoice?.customer?.name || "-"}
                          </p>
                          {/* Putaran 97: baris reversed tetap tampil (histori),
                              wajib berlabel — payment-status.ts. */}
                          {isReversedPayment(payment) && (
                            <StatusChip status={payment.status} />
                          )}
                          <p className="min-w-0 break-words font-mono text-sm font-medium tabular-nums text-foreground">
                            {formatCurrencyExact(Number(payment.amount))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto border-t md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4 lg:px-5">
                          No. Dokumen
                        </TableHead>
                        <TableHead className="px-4 lg:px-5">
                          Pelanggan
                        </TableHead>
                        <TableHead className="px-4 text-right lg:px-5">
                          Jumlah
                        </TableHead>
                        <TableHead className="px-4 lg:px-5">
                          Tanggal
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentPayments.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-10 text-center text-muted-foreground"
                          >
                            Belum ada pembayaran
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.recentPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="px-4 font-mono text-xs font-medium lg:px-5">
                              {payment.documentNo}{" "}
                              {isReversedPayment(payment) && (
                                <StatusChip status={payment.status} />
                              )}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate px-4 font-medium lg:px-5">
                              {payment.salesInvoice?.customer?.name || "-"}
                            </TableCell>
                            <TableCell className="px-4 text-right font-mono text-xs font-medium tabular-nums lg:px-5">
                              {formatCurrencyExact(Number(payment.amount))}
                            </TableCell>
                            <TableCell className="px-4 text-xs tabular-nums text-muted-foreground lg:px-5">
                              {formatDate(payment.paymentDate, {
                                format: "short",
                              })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <NotificationsWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
