import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import {
  Palmtree,
  Building2,
  Briefcase,
  User,
  ArrowUpRight,
  Timer,
  FileText,
  PiggyBank,
} from "@/components/ui/fontawesome-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import { Button } from "@/components/ui/shadcn/button"
import { NotificationsWidget } from "./notifications-widget"

async function getEmployeeData(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  })
  return employee
}

async function getLeaveSummary(employeeId: number) {
  const now = new Date()
  const [activeLeave, pendingLeave, usedThisYear] = await Promise.all([
    prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: "approved",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    prisma.leaveRequest.count({
      where: { employeeId, status: "pending" },
    }),
    prisma.leaveRequest.count({
      where: {
        employeeId,
        status: "approved",
        startDate: {
          gte: new Date(now.getFullYear(), 0, 1),
        },
      },
    }),
  ])
  return { activeLeave: !!activeLeave, pendingLeave, usedThisYear }
}

export default async function EmployeeDashboard() {
  const session = await auth()
  if (!session?.user) return null

  const userId = Number(session.user.id)
  const employee = await getEmployeeData(userId)
  const employeeId = employee?.id

  const leave = employeeId
    ? await getLeaveSummary(employeeId)
    : { activeLeave: false, pendingLeave: 0, usedThisYear: 0 }

  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const quickLinks = [
    { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, desc: "Ajukan atau cek cuti" },
    { label: "Lembur", href: "/sdm/lembur", icon: Timer, desc: "Riwayat lembur" },
    { label: "Timesheet", href: "/sdm/lembar-waktu", icon: FileText, desc: "Catat jam kerja" },
    { label: "Penggajian", href: "/sdm/penggajian", icon: PiggyBank, desc: "Slip gaji" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5">
          {/* Header */}
          <div className="px-4 lg:px-6">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Selamat datang, {employee?.name || session.user.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {today} · Ruang kerja mandiri karyawan dan layanan SDM
            </p>
          </div>

          {/* Profile & Cuti row */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {/* Profile Card */}
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  Profil Karyawan
                </CardTitle>
                <CardDescription>Informasi penempatan dan identitas kerja</CardDescription>
              </CardHeader>
              <CardContent className="border-t py-4 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Briefcase className="size-3.5 shrink-0" />
                      Jabatan
                    </span>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {employee?.position?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" />
                      Departemen
                    </span>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {employee?.department?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Nomor Induk (NIK)</span>
                    <p className="mt-1 font-mono text-sm font-medium text-foreground">
                      {employee?.employeeNo || "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cuti */}
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Palmtree className="size-4 text-muted-foreground" />
                  Ringkasan Cuti
                </CardTitle>
                <CardDescription>Status penggunaan dan pengajuan cuti tahun berjalan</CardDescription>
              </CardHeader>
              <CardContent className="border-t py-4">
                <div className="space-y-3">
                  {leave.activeLeave && (
                    <div className="flex items-center gap-2 rounded-md border border-blue-200/80 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">
                      <Palmtree className="size-3.5 shrink-0" />
                      Sedang cuti aktif
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Terpakai Tahun Ini
                      </span>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                        {leave.usedThisYear}×
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Menunggu Persetujuan
                      </span>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                        {leave.pendingLeave}×
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/sdm/cuti">
                      Ajukan Cuti <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Links */}
          <div className="px-4 lg:px-6">
            <h2 className="mb-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Menu Cepat
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="px-4 lg:px-6">
            <NotificationsWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
