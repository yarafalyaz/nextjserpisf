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
import { StatCard } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
          <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard
              label="Proyek Aktif"
              value={data.activeProjects}
              icon={<FolderKanban className="size-4" />}
            />
            <StatCard
              label="Perintah Kerja"
              value={data.totalWO}
              icon={<Wrench className="size-4" />}
            />
            <StatCard
              label="Proyek Baru (Bulan Ini)"
              value={data.wipProjects}
              icon={<CheckCircle2 className="size-4" />}
              trend="up"
            />
            <StatCard
              label="Mobil di Bengkel"
              value={data.carsInWorkshop}
              icon={<Car className="size-4" />}
            />
          </div>

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
                <div className="border-t">
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Plat</DetailTableTh>
                      <DetailTableTh>Pelanggan</DetailTableTh>
                      <DetailTableTh>Pekerjaan</DetailTableTh>
                      <DetailTableTh>Tahap</DetailTableTh>
                      <DetailTableTh className="w-[170px]">Progres</DetailTableTh>
                      <DetailTableTh>Target</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {data.cars.length === 0 ? (
                        <DetailTableRow>
                          <DetailTableTd colSpan={6} align="center" className="py-10 text-muted-foreground">
                            Belum ada mobil yang sedang dikerjakan
                          </DetailTableTd>
                        </DetailTableRow>
                      ) : (
                        data.cars.map((car) => (
                          <DetailTableRow key={car.id}>
                            <DetailTableTd className="font-mono text-xs font-medium">
                              <span className="inline-flex items-center rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-foreground">
                                {car.plate}
                              </span>
                            </DetailTableTd>
                            <DetailTableTd className="max-w-[160px] truncate font-medium">
                              {car.customer}
                            </DetailTableTd>
                            <DetailTableTd className="max-w-[220px] truncate text-muted-foreground">
                              {car.name}
                            </DetailTableTd>
                            <DetailTableTd>
                              <Badge variant="outline">{car.currentStage}</Badge>
                            </DetailTableTd>
                            <DetailTableTd>
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
                            </DetailTableTd>
                            <DetailTableTd>
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
                            </DetailTableTd>
                          </DetailTableRow>
                        ))
                      )}
                    </DetailTableBody>
                  </DetailTable>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Links */}
          <div className="px-4 lg:px-6">
            <h2 className="mb-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Menu Cepat
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center justify-between gap-3 rounded-lg border bg-card p-3.5 shadow-2xs transition-colors duration-150 hover:border-foreground/20 hover:bg-muted/40"
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
