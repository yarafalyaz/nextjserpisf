"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { StatusChip } from "@/components/ui/status-chip"
import { Eye, Landmark } from "@/components/ui/fontawesome-icons"

export interface BankReconciliationRow {
  id: number
  slug: string | null
  reconciliationNumber?: string | null
  accountId: number
  accountCode?: string | null
  accountName?: string | null
  statementDate: string
  statementBalance: number
  bookBalance: number
  difference: number
  matchedCount: number
  totalItems: number
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<BankReconciliationRow>()

const columns = [
  columnHelper.accessor("reconciliationNumber", {
    header: "No. Rekonsiliasi",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <Link
            href={entityHref("/keuangan/rekonsiliasi-bank", row)}
            className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5 min-h-11 sm:min-h-9"
          >
            <Landmark className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>{row.reconciliationNumber || `REC-${row.id}`}</span>
          </Link>
          <span className="block text-xs text-muted-foreground font-mono">
            {row.accountCode ?? ""} {row.accountName ?? ""}
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("statementDate", {
    header: "Tanggal Laporan",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("statementBalance", {
    header: "Saldo Laporan Bank",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-semibold text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("bookBalance", {
    header: "Saldo Buku Besar",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-medium text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("matchedCount", {
    header: "Kemajuan Pencocokan",
    cell: (info) => {
      const row = info.row.original
      const percent = row.totalItems > 0 ? Math.round((row.matchedCount / row.totalItems) * 100) : 0
      return (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="font-medium text-foreground">{row.matchedCount}/{row.totalItems} baris</span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${percent === 100 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <div className="flex justify-center">
        <StatusChip
          status={info.getValue()}
          customLabel={statusLabel(info.getValue())}
          customTone={info.getValue() === "completed" ? "success" : "warning"}
        />
      </div>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <div className="flex items-center justify-end">
        <Link
          href={entityHref("/keuangan/rekonsiliasi-bank", info.row.original)}
          className="inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted text-foreground transition-colors"
          title="Buka Lembar Kerja Rekonsiliasi"
        >
          <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Detail</span>
        </Link>
      </div>
    ),
  }),
]

interface BankReconciliationTableProps {
  data: BankReconciliationRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function BankReconciliationTable({
  data,
  total,
  page,
  pageSize,
  toolbar,
  filters,
}: BankReconciliationTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      serverPagination={{
        page,
        pageSize,
        total,
      }}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
