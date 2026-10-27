export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { RecurringTransactionTable } from "./_components/recurring-transaction-table"
import { isDue } from "@/lib/reports/recurring-schedule"
import { RecurringDueQueueCard } from "@/components/reports/recurring-due-queue-card"
import { getRecurringDueQueue } from "@/lib/reports/recurring-due-queue-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Transaksi Berulang" }

export default async function RecurringTransactionsPage() {
  await requirePermission("manage_recurring_transactions")

  const now = new Date()
  const schedules = await prisma.recurringTransaction.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
  })

  const rows = schedules.map((schedule) => ({
    id: schedule.id,
    slug: schedule.slug,
    name: schedule.name,
    type: schedule.type,
    frequency: schedule.frequency,
    interval: schedule.interval,
    nextRunDate: schedule.nextRunDate.toLocaleDateString("id-ID"),
    lastRunAt: schedule.lastRunAt?.toLocaleDateString("id-ID") ?? null,
    lastResult: schedule.lastResult,
    runCount: schedule.runCount,
    isActive: schedule.isActive,
    due: schedule.isActive && isDue(schedule.nextRunDate, now),
  }))

  // Antrean jatuh tempo/gagal mengendap (F-2026-10-27-103-S): seksi turunan
  // verbatim loader di atas tabel master (Q-RCQ103-3) — satu tempat kerja:
  // antrean menunjuk, master mengeksekusi. Izin sama ditegakkan loader.
  const dueQueue = await getRecurringDueQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Transaksi Berulang" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Transaksi Berulang</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dokumen dibuat sebagai <strong>draf</strong> (jurnal umum atau beban) agar ditinjau dulu sebelum diposting.
            Penjadwalan otomatis berjalan harian lewat cron <code>/api/cron/recurring-transactions</code>.
          </p>
        </div>
        <CanCreate permission="manage_recurring_transactions">
          <Link href="/pengaturan/transaksi-berulang/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all" id="create-recurring-btn">
            + Tambah Jadwal
          </Link>
        </CanCreate>
      </div>

      <RecurringDueQueueCard queue={dueQueue} />

      <RecurringTransactionTable data={rows} />
    </div>
  )
}
