"use client"

import { useMemo } from "react"
import { createColumnHelper, type ErpColumnDef } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { UnmatchButton } from "./unmatch-button"

export interface MatchedReconciliationRow {
  id: number
  date: string | null
  statementDescription: string
  journalDescription: string
  amount: number
}

export interface AdjustmentReconciliationRow {
  id: number
  date: string | null
  type: string
  description: string | null
  amount: number
}

const matchedColumnHelper = createColumnHelper<MatchedReconciliationRow>()
const adjustmentColumnHelper = createColumnHelper<AdjustmentReconciliationRow>()

export function MatchedItemsTable({
  data,
  reconciliationId,
  canWrite,
}: {
  data: MatchedReconciliationRow[]
  reconciliationId: number
  canWrite: boolean
}) {
  const columns = useMemo(() => {
    const base: ErpColumnDef<MatchedReconciliationRow, any>[] = [
      matchedColumnHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => {
          const val = info.getValue()
          return val ? formatDate(val) : "-"
        },
      }),
      matchedColumnHelper.accessor("statementDescription", {
        header: "Baris Rekening Koran",
        meta: { mobilePrimary: true },
        cell: (info) => info.getValue(),
      }),
      matchedColumnHelper.accessor("journalDescription", {
        header: "Entri Jurnal",
        cell: (info) => info.getValue(),
      }),
      matchedColumnHelper.accessor("amount", {
        header: "Nominal",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {formatCurrencyExact(info.getValue())}
          </span>
        ),
      }),
    ]
    if (canWrite) {
      base.push(
        matchedColumnHelper.display({
          id: "actions",
          header: "Aksi",
          meta: { align: "right" },
          cell: (info) => (
            <div className="flex items-center justify-end">
              <UnmatchButton
                reconciliationId={reconciliationId}
                itemId={info.row.original.id}
              />
            </div>
          ),
        }),
      )
    }
    return base
  }, [canWrite, reconciliationId])

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar baris yang sudah cocok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export function AdjustmentsTable({
  data,
  reconciliationId,
  canWrite,
}: {
  data: AdjustmentReconciliationRow[]
  reconciliationId: number
  canWrite: boolean
}) {
  const columns = useMemo(() => {
    const base: ErpColumnDef<AdjustmentReconciliationRow, any>[] = [
      adjustmentColumnHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => {
          const val = info.getValue()
          return val ? formatDate(val) : "-"
        },
      }),
      adjustmentColumnHelper.accessor("type", {
        header: "Jenis",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const val = info.getValue()
          return val === "outstanding_deposit"
            ? "Setoran beredar"
            : val === "outstanding_check"
              ? "Cek beredar"
              : val || "-"
        },
      }),
      adjustmentColumnHelper.accessor("description", {
        header: "Deskripsi",
        cell: (info) => info.getValue() || "-",
      }),
      adjustmentColumnHelper.accessor("amount", {
        header: "Nominal",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {formatCurrencyExact(info.getValue())}
          </span>
        ),
      }),
    ]
    if (canWrite) {
      base.push(
        adjustmentColumnHelper.display({
          id: "actions",
          header: "Aksi",
          meta: { align: "right" },
          cell: (info) => (
            <div className="flex items-center justify-end">
              <UnmatchButton
                reconciliationId={reconciliationId}
                itemId={info.row.original.id}
              />
            </div>
          ),
        }),
      )
    }
    return base
  }, [canWrite, reconciliationId])

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar item penyesuaian"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
