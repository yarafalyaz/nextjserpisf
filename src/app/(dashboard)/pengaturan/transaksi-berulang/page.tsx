import { Plus } from "@/components/ui/fontawesome-icons";
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Jadwal Transaksi Berulang (Recurring)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Otomatisasi pembuatan draf transaksi (jurnal umum atau beban berkala) yang dieksekusi harian melalui cron backend.
          </p>
        </div>
        <CanCreate permission="manage_recurring_transactions">
          <Link
            href="/pengaturan/transaksi-berulang/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-recurring-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Jadwal</span>
          </Link>
        </CanCreate>
      </div>

      <RecurringDueQueueCard queue={dueQueue} />

      <RecurringTransactionTable data={rows} />
    </div>
  )
}
