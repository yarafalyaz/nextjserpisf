"use client"

import Link from "next/link"
import { entityEditHref } from "@/lib/utils/entity-url"
import { useState, useTransition } from "react"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { deleteRecurringTransaction, runAllDueRecurring, runRecurringNow } from "@/actions/recurring.actions"
import { describeSchedule, type RecurrenceFrequency } from "@/lib/reports/recurring-schedule"

interface RecurringRow {
  id: number
  slug: string | null
  name: string
  type: string
  frequency: string
  interval: number
  nextRunDate: string
  lastRunAt: string | null
  lastResult: string | null
  runCount: number
  isActive: boolean
  due: boolean
}

const columnHelper = createColumnHelper<RecurringRow>()

export function RecurringTransactionTable({ data }: { data: RecurringRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [runningId, setRunningId] = useState<number | null>(null)

  function runNow(row: RecurringRow) {
    setRunningId(row.id)
    startTransition(async () => {
      const result = await runRecurringNow(row.id)
      setRunningId(null)
      if (result.success) showSuccess(`Dokumen dibuat: ${result.message}`)
      else showError(result.error ?? "Gagal menjalankan jadwal")
    })
  }

  function runAllDue() {
    startTransition(async () => {
      const result = await runAllDueRecurring()
      if (!result.success) {
        showError(result.error ?? "Gagal menjalankan jadwal")
        return
      }
      const generated = result.generated?.length ?? 0
      const errors = result.errors?.length ?? 0
      showSuccess(`${generated} dokumen dibuat${errors ? `, ${errors} jadwal gagal (lihat kolom Hasil Terakhir)` : ""}`)
    })
  }

  const dueCount = data.filter((row) => row.due).length

  const columns = [
    columnHelper.accessor("name", {
      header: "Nama Jadwal",
      cell: (info) => (
        <Link href={entityEditHref("/pengaturan/transaksi-berulang", info.row.original)} className="text-foreground hover:underline font-medium">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor("type", {
      header: "Dokumen",
      cell: (info) => (info.getValue() === "journal" ? "Jurnal Umum" : "Beban"),
    }),
    columnHelper.accessor("frequency", {
      header: "Jadwal",
      cell: (info) => describeSchedule(info.getValue() as RecurrenceFrequency, info.row.original.interval),
    }),
    columnHelper.accessor("nextRunDate", {
      header: "Jadwal Berikutnya",
      cell: (info) => (
        <span className={info.row.original.due ? "text-danger font-semibold" : ""}>
          {info.getValue()}
          {info.row.original.due ? " (jatuh tempo)" : ""}
        </span>
      ),
    }),
    columnHelper.accessor("lastRunAt", {
      header: "Terakhir",
      cell: (info) => info.getValue() || "-",
    }),
    columnHelper.accessor("lastResult", {
      header: "Hasil Terakhir",
      cell: (info) => {
        const value = info.getValue()
        if (!value) return "-"
        return <span className={value.startsWith("Gagal") ? "text-danger" : ""}>{value}</span>
      },
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) => <StatusChip status={info.getValue() ? "active" : "inactive"} />,
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            isDisabled={isPending && runningId === info.row.original.id}
            onPress={() => runNow(info.row.original)}
          >
            {isPending && runningId === info.row.original.id ? "..." : "Jalankan"}
          </Button>
          <ActionDropdown
            editHref={`/pengaturan/transaksi-berulang/${info.row.original.slug ?? info.row.original.id}/ubah`}
            deleteAction={deleteRecurringTransaction}
            deleteId={info.row.original.id}
            editPermission="manage_recurring_transactions"
            deletePermission="manage_recurring_transactions"
          />
        </div>
      ),
    }),
  ]

  return (
    <div className="flex flex-col gap-4">
      {dueCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <span className="text-sm">
            <strong>{dueCount}</strong> jadwal sudah jatuh tempo dan belum dijalankan.
          </span>
          <Button variant="primary" size="sm" isDisabled={isPending} onPress={runAllDue}>
            {isPending ? "Menjalankan..." : "Jalankan Semua yang Jatuh Tempo"}
          </Button>
        </div>
      )}

      <DataTable data={data} columns={columns} ariaLabel="Daftar transaksi berulang" selectable={false} />
    </div>
  )
}
