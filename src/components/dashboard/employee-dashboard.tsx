import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
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
import { NotificationsWidget } from "./notifications-widget"

function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86_400_000)
  return { start, end }
}

async function getEmployeeData(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: { userId, isActive: true },
    include: {
      department: true,
      position: true,
    },
  })
  return employee
}

async function getLeaveSummary(employeeId: number) {
  const now = new Date()
  const activeLeave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "approved",
      startDate: { lte: now },
      endDate: { gte: now },
    },
  })
  const pendingLeave = await prisma.leaveRequest.count({
    where: { employeeId, status: "pending" },
  })
  const usedThisYear = await prisma.leaveRequest.count({
    where: {
      employeeId,
      status: "approved",
      startDate: {
        gte: new Date(now.getFullYear(), 0, 1),
      },
    },
  })
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
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Header */}
          <div className="px-4 lg:px-6">
            <p className="text-xs text-muted-foreground">{today}</p>
            <h1 className="mt-1 text-xl font-semibold">
              Selamat datang, {employee?.name || session.user.name}
            </h1>
          </div>

          {/* Profile & Cuti row */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {/* Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-primary" />
                  Profil Saya
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="size-3.5 shrink-0" />
                  <span>{employee?.position?.name || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  <span>{employee?.department?.name || "-"}</span>
                </div>
                {employee?.employeeNo && (
                  <div className="text-xs text-muted-foreground">
                    NIK: {employee.employeeNo}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cuti */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Palmtree className="size-4 text-primary" />
                  Cuti
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leave.activeLeave && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400">
                      <Palmtree className="size-3.5 shrink-0" />
                      Sedang cuti aktif
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Tahun ini
                      </span>
                      <p className="font-medium">{leave.usedThisYear}×</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Menunggu
                      </span>
                      <p className="font-medium">{leave.pendingLeave}×</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/sdm/cuti">
                      Ajukan Cuti <ArrowUpRight className="ml-1 size-3" />
                    </Link>
                  </Button>
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
                  <span className="text-[10px] text-muted-foreground">
                    {link.desc}
                  </span>
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
