import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  Wrench,
  FolderKanban,
  Settings2,
  Car,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from "@/components/ui/fontawesome-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
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

async function getWorkshopData() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [activeProjects, workOrderStats, projects, wipProjects, carsInWorkshop] =
    await Promise.all([
      prisma.project.count({ where: { status: { notIn: DONE_STATES } } }),
      prisma.workOrder.groupBy({
        by: ["status"],
        _count: true,
        where: { status: { in: ["draft", "pending", "in_progress"] } },
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
            select: { plateNumber: true },
          },
          stages: {
            select: { name: true, sortOrder: true, status: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      prisma.project.count({
        where: {
          status: { notIn: DONE_STATES },
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.project.count({
        where: { status: { notIn: DONE_STATES }, customerVehicleId: { not: null } },
      }),
    ])

  const totalWO = workOrderStats.reduce((sum, r) => sum + r._count, 0)

  const cars = projects.map((project) => {
    const totalStages = project.stages.length
    const doneStages = project.stages.filter((s) =>
      STAGE_DONE.includes(s.status),
    ).length
    const progress =
      totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0
    const currentStage =
      project.stages.find((s) => !STAGE_DONE.includes(s.status))?.name ??
      "Selesai"
    return {
      id: project.id,
      name: project.name,
      plate: project.customerVehicle?.plateNumber || "-",
      customer: project.customer?.name || "-",
      currentStage,
      progress,
      endDate: project.endDate,
      overdue:
        !!project.endDate && new Date(project.endDate) < now,
    }
  })

  return { activeProjects, totalWO, wipProjects, cars, workOrderStats, carsInWorkshop }
}

export default async function WorkshopDashboard() {
  const data = await getWorkshopData()
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const quickLinks = [
    { label: "Proyek", href: "/proyek", icon: FolderKanban, desc: "Kelola proyek" },
    { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, desc: "Perintah kerja" },
    { label: "Produk (BOM)", href: "/produksi/products", icon: Settings2, desc: "Daftar material" },
    { label: "Manufaktur", href: "/produksi/production-orders", icon: Settings2, desc: "Perintah produksi" },
    { label: "Timesheet", href: "/sdm/lembar-waktu", icon: Clock, desc: "Jam kerja" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5">
          <div className="flex flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center lg:px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Dasbor Operasional Bengkel
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {today} · Pemantauan progres pengerjaan kendaraan dan perintah kerja
              </p>
            </div>
          </div>

          {/* Stats */}
          <section aria-label="Ringkasan bengkel" className="px-4 lg:px-6">
            <dl className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Proyek Aktif</dt>
                  <FolderKanban className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.activeProjects}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Perintah Kerja</dt>
                  <Wrench className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.totalWO}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t lg:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Proyek Baru (Bulan Ini)</dt>
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.wipProjects}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t lg:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Mobil di Bengkel</dt>
                  <Car className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.carsInWorkshop}
                </dd>
              </div>
            </dl>
          </section>

          {/* Cars in workshop */}
          <div className="px-4 lg:px-6">
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <Car className="size-4 text-muted-foreground" />
                  Mobil di Bengkel
                </CardTitle>
                <CardDescription>Proyek aktif dan tahap pengerjaannya</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/proyek">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t md:hidden">
                  {data.cars.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada mobil yang sedang dikerjakan
                    </p>
                  ) : (
                    data.cars.map((car) => (
                      <div key={car.id} className="space-y-2 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex shrink-0 items-center rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground">
                              {car.plate}
                            </span>
                            <span className="truncate text-xs font-medium text-foreground">{car.customer}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0">{car.currentStage}</Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{car.name}</p>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-1 items-center gap-2">
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
                          {car.endDate ? (
                            <span
                              className={
                                car.overdue
                                  ? "shrink-0 text-xs font-medium tabular-nums text-red-600 dark:text-red-400"
                                  : "shrink-0 text-xs tabular-nums text-muted-foreground"
                              }
                            >
                              {formatDate(car.endDate, { format: "short" })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden border-t md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plat</TableHead>
                        <TableHead>Pelanggan</TableHead>
                        <TableHead>Pekerjaan</TableHead>
                        <TableHead>Tahap</TableHead>
                        <TableHead className="w-[170px]">Progres</TableHead>
                        <TableHead>Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cars.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            Belum ada mobil yang sedang dikerjakan
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.cars.map((car) => (
                          <TableRow key={car.id}>
                            <TableCell className="font-mono text-xs font-medium">
                              <span className="inline-flex items-center rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground">
                                {car.plate}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate font-medium">
                              {car.customer}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-muted-foreground">
                              {car.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{car.currentStage}</Badge>
                            </TableCell>
                            <TableCell>
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
                            <TableCell>
                              {car.endDate ? (
                                car.overdue ? (
                                  <span className="text-xs font-medium tabular-nums text-red-600 dark:text-red-400">
                                    {formatDate(car.endDate, { format: "short" })}
                                  </span>
                                ) : (
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {formatDate(car.endDate, { format: "short" })}
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
          </div>

          {/* Quick Links */}
          <div className="px-4 lg:px-6">
            <h2 className="mb-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Menu Cepat
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-5">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 shadow-2xs transition-all duration-150 active:scale-[0.98] sm:gap-3 sm:p-3.5 [@media(hover:hover)]:hover:border-foreground/20 [@media(hover:hover)]:hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground transition-colors group-hover:text-foreground">
                      <link.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">{link.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{link.desc}</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors duration-150 group-hover:translate-x-0.5 group- group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
