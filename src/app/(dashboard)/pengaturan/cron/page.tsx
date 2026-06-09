export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CronTaskList } from "./_components/cron-task-list"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Cron" }

const CRON_TASKS = [
  {
    key: "lock-period",
    name: "Kunci Periode Otomatis",
    description: "Kunci periode transaksi di akhir bulan",
    schedule: "Tanggal 1 jam 00:00",
  },
  {
    key: "low-stock",
    name: "Peringatan Stok Menipis",
    description: "Cek item yang stoknya di bawah minimum",
    schedule: "Setiap hari",
  },
  {
    key: "overdue-invoice",
    name: "Peringatan Faktur Jatuh Tempo",
    description: "Cek invoice yang sudah jatuh tempo",
    schedule: "Setiap hari",
  },
  {
    key: "cleanup",
    name: "Bersihkan Log Lama",
    description: "Hapus log aktivitas > 90 hari",
    schedule: "Mingguan",
  },
]

export default async function CronPage() {
  await requirePermission("manage_settings")

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
        <p className="text-sm text-muted-foreground mt-1">
          Kelola tugas terjadwal otomatis sistem
        </p>
      </div>

      <CronTaskList tasks={latestPerTask} logs={logs} />
    </div>
  )
}
