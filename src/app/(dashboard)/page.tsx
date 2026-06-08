export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  DollarSign,
  Car,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Clock,
  type LucideIcon,
} from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
import {
  RevenueChart,
  SalesStatusChart,
  ProjectPipelineChart,
} from "@/components/dashboard/charts"
import { NotificationsWidget } from "@/components/dashboard/notifications-widget"

const DONE_STATES = ["completed", "cancelled", "done", "closed"]
const STAGE_DONE = ["completed", "skipped"]

async function getCharts() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const revenueRaw = await prisma.$queryRaw<{ month: string; revenue: number }[]>`
    SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COALESCE(SUM(paid_amount), 0) as revenue
    FROM sales_invoices
    WHERE created_at >= ${sixMonthsAgo} AND status IN ('posted', 'partial', 'paid') AND deleted_at IS NULL
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month ASC
  `
  const revenueData = revenueRaw.map((r) => ({ month: r.month, revenue: Number(r.revenue) }))

  const statusRaw = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT status, COUNT(*) as count FROM sales_invoices WHERE deleted_at IS NULL GROUP BY status
  `
  const salesByStatus = statusRaw.map((s) => ({ name: s.status, value: Number(s.count) }))

  // Active projects grouped by their currently in-progress stage
  const pipelineRaw = await prisma.$queryRaw<{ stage: string; count: bigint }[]>`
    SELECT ps.name as stage, COUNT(DISTINCT ps.project_id) as count
    FROM project_stages ps
    JOIN projects p ON ps.project_id = p.id
    WHERE p.status NOT IN ('completed', 'cancelled')
      AND ps.status = 'in_progress'
    GROUP BY ps.name
    ORDER BY MIN(ps.sort_order) ASC
  `
  const pipeline = pipelineRaw.map((r) => ({ stage: r.stage, count: Number(r.count) }))

  return { revenueData, salesByStatus, pipeline }
}

type ActiveProject = {
  id: number
  name: string
  endDate: Date | null
  customer: { name: string }
  customerVehicle: { licensePlate: string | null; vehicleType: string | null } | null
  stages: { name: string; sortOrder: number; status: string }[]
}

async function getWorkshop() {
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
  ] = await Promise.all([
    prisma.project.count({ where: { status: { notIn: DONE_STATES } } }),
    prisma.project.count({ where: { status: { in: ["completed", "done"] }, updatedAt: { gte: startOfMonth } } }),
    prisma.project.count({ where: { status: { notIn: DONE_STATES }, endDate: { lt: now } } }),
    prisma.project.findMany({
      where: { status: { notIn: DONE_STATES } },
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        endDate: true,
        customer: { select: { name: true } },
        customerVehicle: { select: { licensePlate: true, vehicleType: true } },
        stages: { select: { name: true, sortOrder: true, status: true }, orderBy: { sortOrder: "asc" } },
      },
    }) as Promise<ActiveProject[]>,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(grand_total - paid_amount), 0) as total
      FROM sales_invoices WHERE status IN ('posted', 'partial') AND deleted_at IS NULL
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
    prisma.$queryRaw`
      SELECT id, name, qty_on_hand as qtyOnHand, min_stock as minStock
      FROM items
      WHERE is_active = true AND min_stock > 0 AND qty_on_hand <= min_stock AND deleted_at IS NULL
      ORDER BY qty_on_hand ASC LIMIT 6
    ` as Promise<{ id: number; name: string; qtyOnHand: number; minStock: number }[]>,
  ])

  const cars = workshopList.map((p) => {
    const total = p.stages.length
    const done = p.stages.filter((s) => STAGE_DONE.includes(s.status)).length
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    const current = p.stages.find((s) => !STAGE_DONE.includes(s.status))?.name ?? "Selesai"
    const overdue = !!p.endDate && new Date(p.endDate) < now
    return {
      id: p.id,
      name: p.name,
      plate: p.customerVehicle?.licensePlate || "—",
      customer: p.customer?.name || "—",
      currentStage: current,
      progress,
      endDate: p.endDate,
      overdue,
    }
  })

  return {
    activeProjects,
    completedThisMonth,
    overdueProjects,
    cars,
    receivables: Number(receivablesAgg[0]?.total || 0),
    totalRevenue: Number(revenueAgg._sum.paidAmount || 0),
    recentPayments,
    lowStockItems,
  }
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  badge,
  badgeTone = "default",
}: {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  badge?: string
  badgeTone?: "default" | "success" | "warning" | "danger"
}) {
  const badgeClass: Record<string, string> = {
    default: "",
    success: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    warning: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    danger: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  }
  return (
    <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <Badge variant="outline" className={badgeClass[badgeTone]}>
            <Icon className="size-3.5" />
            {badge}
          </Badge>
        </CardAction>
      </CardHeader>
      {hint && (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="line-clamp-1 flex items-center gap-1.5 font-medium">
            <Icon className="size-4" /> {label}
          </span>
          <span className="text-muted-foreground">{hint}</span>
        </CardFooter>
      )}
    </Card>
  )
}

export default async function DashboardPage() {
  await requirePermission("view_dashboard")

  const [w, charts] = await Promise.all([getWorkshop(), getCharts()])
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dasbor Bengkel</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/proyek">
            <TrendingUp className="size-4" /> Kelola Proyek
          </Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Mobil Dikerjakan" value={w.activeProjects} icon={Car} badge="Aktif" badgeTone="default" hint="Proyek aktif berjalan" />
        <KpiCard label="Selesai Bln Ini" value={w.completedThisMonth} icon={CheckCircle2} badge="Rampung" badgeTone="success" hint="Proyek selesai bulan ini" />
        <KpiCard label="Proyek Telat" value={w.overdueProjects} icon={Clock} badge="Telat" badgeTone="danger" hint="Melewati target tanggal" />
        <KpiCard label="Pendapatan" value={formatCurrency(w.totalRevenue)} icon={DollarSign} badge="Diterima" badgeTone="success" hint="Pembayaran terkonfirmasi" />
        <KpiCard label="Piutang Berjalan" value={formatCurrency(w.receivables)} icon={Wallet} badge="Belum lunas" badgeTone="warning" hint="Sisa tagihan berjalan" />
      </div>

      {/* Pipeline + Sales status */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <ProjectPipelineChart data={charts.pipeline} />
        </div>
        <SalesStatusChart data={charts.salesByStatus} />
      </div>

      {/* Mobil di Bengkel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="size-4 text-primary" /> Mobil di Bengkel
          </CardTitle>
          <CardDescription>Proyek aktif &amp; tahap pengerjaannya</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/proyek">
                Semua <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plat</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Pekerjaan</TableHead>
                <TableHead>Tahap</TableHead>
                <TableHead className="w-[160px]">Progress</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {w.cars.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Belum ada mobil yang sedang dikerjakan
                  </TableCell>
                </TableRow>
              ) : (
                w.cars.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-medium">{c.plate}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{c.customer}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.currentStage}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${c.progress}%` }} />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {c.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.endDate ? (
                        c.overdue ? (
                          <Badge variant="outline" className="border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                            {formatDate(c.endDate)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">{formatDate(c.endDate)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Revenue trend + Low stock */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <RevenueChart data={charts.revenueData} />
        </div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" /> Stok Menipis
            </CardTitle>
            <CardDescription>Sparepart perlu dibeli</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/master/barang">Semua</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {w.lowStockItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Semua stok aman</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {w.lowStockItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-xs font-medium text-destructive tabular-nums">
                      {Number(item.qtyOnHand)} / {Number(item.minStock)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      <NotificationsWidget />

      {/* Recent payments */}
      <Card>
        <CardHeader>
          <CardTitle>Pembayaran Terbaru</CardTitle>
          <CardDescription>6 pembayaran terakhir diterima</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/penjualan/pembayaran">
                Semua <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Dokumen</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {w.recentPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada pembayaran
                  </TableCell>
                </TableRow>
              ) : (
                w.recentPayments.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell className="font-mono text-xs">{pay.documentNo}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {pay.salesInvoice?.customer?.name || "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(pay.amount))}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(pay.paymentDate)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
