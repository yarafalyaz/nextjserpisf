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
} from "lucide-react"
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

  const [activeProjects, workOrderStats, projects, wipProjects] =
    await Promise.all([
      prisma.project.count({ where: { status: { notIn: DONE_STATES } } }),
      prisma.workOrder.groupBy({
        by: ["status"],
        _count: true,
        where: { status: { notIn: ["cancelled", "completed"] } },
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
            select: { vehicleType: true, vehicle: { select: { plateNumber: true } } },
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
      plate: project.customerVehicle?.vehicle?.plateNumber || "-",
      customer: project.customer?.name || "-",
      currentStage,
      progress,
      endDate: project.endDate,
      overdue:
        !!project.endDate && new Date(project.endDate) < now,
    }
  })

  return { activeProjects, totalWO, wipProjects, cars, workOrderStats }
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
    { label: "Work Order", href: "/produksi/perintah-kerja", icon: Wrench, desc: "Perintah kerja" },
    { label: "Produk (BOM)", href: "/produksi/products", icon: Settings2, desc: "Daftar material" },
    { label: "Manufaktur", href: "/produksi/production-orders", icon: Settings2, desc: "Perintah produksi" },
    { label: "Timesheet", href: "/sdm/lembar-waktu", icon: Clock, desc: "Jam kerja" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 text-xs text-muted-foreground lg:px-6">
            {today}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard
              label="Proyek Aktif"
              value={data.activeProjects}
              icon={<FolderKanban className="size-5" />}
            />
            <StatCard
              label="Work Order"
              value={data.totalWO}
              icon={<Wrench className="size-5" />}
            />
            <StatCard
              label="Proyek Baru (Bulan Ini)"
              value={data.wipProjects}
              icon={<CheckCircle2 className="size-5" />}
              trend="up"
            />
            <StatCard
              label="Mobil di Bengkel"
              value={data.cars.length}
              icon={<Car className="size-5" />}
            />
          </div>

          {/* Cars in workshop */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="size-4 text-primary" />
                  Mobil di Bengkel
                </CardTitle>
                <CardDescription>Proyek aktif dan tahap pengerjaannya</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
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
                              {car.plate}
                            </DetailTableTd>
                            <DetailTableTd className="max-w-[160px] truncate">
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
                                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                  {car.progress}%
                                </span>
                              </div>
                            </DetailTableTd>
                            <DetailTableTd>
                              {car.endDate ? (
                                car.overdue ? (
                                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                                    {formatDate(car.endDate, { format: "short" })}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
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
            <h2 className="mb-3 text-sm font-semibold">Menu Cepat</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition-colors hover:bg-accent"
                >
                  <link.icon className="size-5 text-primary" />
                  <span className="text-xs font-medium">{link.label}</span>
                  <span className="text-[10px] text-muted-foreground">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
