export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { RecurringTransactionTable } from "./_components/recurring-transaction-table"
import { isDue } from "@/lib/reports/recurring-schedule"

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Transaksi Berulang" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaksi Berulang</h1>
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

      <RecurringTransactionTable data={rows} />
    </div>
  )
}
