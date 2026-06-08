export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Car } from "lucide-react"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { NotificationsWidget } from "@/components/dashboard/notifications-widget"
import { RecentInvoicesTable } from "@/components/dashboard/recent-invoices-table"
import { SectionCards } from "@/components/dashboard/section-cards"
import {
  ProjectPipelineChart,
  RevenueChart,
  SalesStatusChart,
} from "@/components/dashboard/charts"
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

const DONE_STATES = ["completed", "cancelled", "done", "closed"]
const STAGE_DONE = ["completed", "skipped"]

type ActiveProject = {
  id: number
  name: string
  endDate: Date | null
  customer: { name: string }
  customerVehicle: {
    licensePlate: string | null
    vehicleType: string | null
  } | null
  stages: { name: string; sortOrder: number; status: string }[]
}

async function getCharts() {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)

  const revenueRaw = await prisma.$queryRaw<
    { date: string; lunas: number; tagihan: number }[]
  >`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date,
           COALESCE(SUM(paid_amount), 0) as lunas,
           COALESCE(SUM(grand_total), 0) as tagihan
    FROM sales_invoices
    WHERE created_at >= ${ninetyDaysAgo}
      AND status IN ('posted', 'partial', 'paid')
      AND deleted_at IS NULL
    GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
    ORDER BY date ASC
  `

  const statusRaw = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT status, COUNT(*) as count
    FROM sales_invoices
    WHERE deleted_at IS NULL
    GROUP BY status
  `

  const pipelineRaw = await prisma.$queryRaw<
    { stage: string; count: bigint }[]
  >`
    SELECT ps.name as stage, COUNT(DISTINCT ps.project_id) as count
    FROM project_stages ps
    JOIN projects p ON ps.project_id = p.id
    WHERE p.status NOT IN ('completed', 'cancelled')
      AND ps.status = 'in_progress'
    GROUP BY ps.name
    ORDER BY MIN(ps.sort_order) ASC
  `

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
    totalItems,
    recentInvoices,
  ] = await Promise.all([
    prisma.project.count({ where: { status: { notIn: DONE_STATES } } }),
    prisma.project.count({
      where: {
        status: { in: ["completed", "done"] },
        updatedAt: { gte: startOfMonth },
      },
    }),
    prisma.project.count({
      where: { status: { notIn: DONE_STATES }, endDate: { lt: now } },
    }),
    prisma.project.findMany({
      where: { status: { notIn: DONE_STATES } },
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        endDate: true,
        customer: { select: { name: true } },
        customerVehicle: {
          select: { licensePlate: true, vehicleType: true },
        },
        stages: {
          select: { name: true, sortOrder: true, status: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }) as Promise<ActiveProject[]>,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(grand_total - paid_amount), 0) as total
      FROM sales_invoices
      WHERE status IN ('posted', 'partial') AND deleted_at IS NULL
    `,
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
    prisma.item.count({ where: { isActive: true, deletedAt: null } }),
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
      plate: project.customerVehicle?.licensePlate || "-",
      customer: project.customer?.name || "-",
      currentStage,
      progress,
      endDate: project.endDate,
      overdue: !!project.endDate && new Date(project.endDate) < now,
    }
  })

  const invoiceRows = recentInvoices.map((invoice) => ({
    id: invoice.id,
    documentNo: invoice.documentNo,
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
    receivables: Number(receivablesAgg[0]?.total || 0),
    totalRevenue: Number(revenueAgg._sum.paidAmount || 0),
    recentPayments,
    lowStockItems,
    totalCustomers,
    totalItems,
    invoiceRows,
  }
}

export default async function DashboardPage() {
  await requirePermission("view_dashboard")

  const [data, charts] = await Promise.all([getDashboardData(), getCharts()])

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div data-dashboard-page="true" className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 text-xs text-muted-foreground lg:px-6">
            {today}
          </div>

          <SectionCards
            totalRevenue={formatCurrency(data.totalRevenue)}
            activeProjects={data.activeProjects}
            completedThisMonth={data.completedThisMonth}
            overdueProjects={data.overdueProjects}
            receivables={formatCurrency(data.receivables)}
            totalCustomers={data.totalCustomers}
            totalItems={data.totalItems}
          />

          <div className="px-4 lg:px-6">
            <RevenueChart data={charts.revenueData} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 px-4 lg:grid-cols-3 lg:px-6">
            <div className="h-full lg:col-span-2">
              <ProjectPipelineChart data={charts.pipeline} />
            </div>
            <SalesStatusChart data={charts.salesByStatus} />
          </div>

          <div className="px-4 lg:px-6">
            <RecentInvoicesTable data={data.invoiceRows} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 px-4 xl:grid-cols-3 lg:px-6">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="size-4 text-primary" />
                  Mobil di Bengkel
                </CardTitle>
                <CardDescription>
                  Proyek aktif dan tahap pengerjaannya
                </CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/proyek">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4 lg:px-6">Plat</TableHead>
                        <TableHead className="px-4 lg:px-6">
                          Pelanggan
                        </TableHead>
                        <TableHead className="px-4 lg:px-6">
                          Pekerjaan
                        </TableHead>
                        <TableHead className="px-4 lg:px-6">Tahap</TableHead>
                        <TableHead className="w-[170px] px-4 lg:px-6">
                          Progress
                        </TableHead>
                        <TableHead className="px-4 lg:px-6">Target</TableHead>
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
                            <TableCell className="px-4 font-mono text-xs font-medium lg:px-6">
                              {car.plate}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate px-4 lg:px-6">
                              {car.customer}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate px-4 text-muted-foreground lg:px-6">
                              {car.name}
                            </TableCell>
                            <TableCell className="px-4 lg:px-6">
                              <Badge variant="outline">
                                {car.currentStage}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 lg:px-6">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{ width: `${car.progress}%` }}
                                  />
                                </div>
                                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                  {car.progress}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="px-4 lg:px-6">
                              {car.endDate ? (
                                car.overdue ? (
                                  <Badge
                                    variant="outline"
                                    className="border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                                  >
                                    {formatDate(car.endDate, {
                                      format: "short",
                                    })}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Stok Menipis
                </CardTitle>
                <CardDescription>Sparepart perlu dibeli ulang</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/master/barang">Semua</Link>
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
                    {data.lowStockItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {item.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                        >
                          {Number(item.qtyOnHand)} / {Number(item.minStock)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Pembayaran Terbaru</CardTitle>
                <CardDescription>
                  6 pembayaran terakhir diterima
                </CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/penjualan/pembayaran">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4 lg:px-6">
                          No. Dokumen
                        </TableHead>
                        <TableHead className="px-4 lg:px-6">
                          Pelanggan
                        </TableHead>
                        <TableHead className="px-4 text-right lg:px-6">
                          Jumlah
                        </TableHead>
                        <TableHead className="px-4 lg:px-6">
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
                            <TableCell className="px-4 font-mono text-xs lg:px-6">
                              {payment.documentNo}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate px-4 lg:px-6">
                              {payment.salesInvoice?.customer?.name || "-"}
                            </TableCell>
                            <TableCell className="px-4 text-right tabular-nums lg:px-6">
                              {formatCurrency(Number(payment.amount))}
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground lg:px-6">
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
