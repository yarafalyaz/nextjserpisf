export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CronTaskList } from "./_components/cron-task-list"

const CRON_TASKS = [
  {
    key: "lock-period",
    name: "Auto Lock Period",
    description: "Kunci period transaksi di akhir bulan",
    schedule: "Tanggal 1 jam 00:00",
  },
  {
    key: "low-stock",
    name: "Low Stock Alert",
    description: "Cek item yang stoknya di bawah minimum",
    schedule: "Setiap hari",
  },
  {
    key: "overdue-invoice",
    name: "Overdue Invoice Alert",
    description: "Cek invoice yang sudah jatuh tempo",
    schedule: "Setiap hari",
  },
  {
    key: "cleanup",
    name: "Cleanup Old Logs",
    description: "Hapus log activity > 90 hari",
    schedule: "Mingguan",
  },
]

export default async function CronPage() {
  await requirePermission("pengaturan.view")

  const logs = await prisma.cronLog.findMany({
    orderBy: { ranAt: "desc" },
    take: 10,
  })

  // Get latest status per task
  const latestPerTask = CRON_TASKS.map((task) => {
    const latest = logs.find((l) => l.task === task.key)
    return {
      ...task,
      lastRun: latest
        ? { status: latest.status, message: latest.message, ranAt: latest.ranAt, duration: latest.duration }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <AppBreadcrumbs
        items={[
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Cron Jobs" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Cron Jobs</h1>
        <p className="text-sm text-muted mt-1">
          Kelola scheduled tasks otomatis sistem
        </p>
      </div>

      <CronTaskList tasks={latestPerTask} logs={logs} />
    </div>
  )
}
