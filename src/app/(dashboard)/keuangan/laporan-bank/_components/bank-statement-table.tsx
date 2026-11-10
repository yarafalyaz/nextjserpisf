"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { StatusChip } from "@/components/ui/status-chip"
import { Eye, FileSpreadsheet, Landmark } from "@/components/ui/fontawesome-icons"

export interface BankStatementRow {
  id: number
  slug: string | null
  accountId: number
  accountCode?: string | null
  accountName?: string | null
  accountNumber?: string | null
  date: string
  reference?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  closingBalance: number
  lineCount: number
  status: string
}

const columnHelper = createColumnHelper<BankStatementRow>()

const columns = [
  columnHelper.accessor("id", {
    header: "ID & Dokumen",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <Link
            href={entityHref("/keuangan/laporan-bank", row)}
            className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5 min-h-11 sm:min-h-9"
          >
            <FileSpreadsheet className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>#{row.id}</span>
          </Link>
          {row.reference && (
            <span className="block text-xs text-muted-foreground font-mono">
              Ref: {row.reference}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("accountName", {
    header: "Akun Bank / Rekening",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <div className="flex items-center gap-1.5">
            <Landmark className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="font-medium text-xs text-foreground">
              {row.accountName ? `${row.accountCode ?? ""} - ${row.accountName}` : `Akun #${row.accountId}`}
            </span>
          </div>
          {row.accountNumber && (
            <span className="block text-xs text-muted-foreground font-mono pl-5">
              No. Rek: {row.accountNumber}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("periodStart", {
    header: "Periode Mutasi",
    cell: (info) => {
      const row = info.row.original
      if (!row.periodStart && !row.periodEnd) return <span className="text-xs text-muted-foreground">-</span>
      return (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {row.periodStart ? formatDate(row.periodStart) : "-"} s/d{" "}
          {row.periodEnd ? formatDate(row.periodEnd) : "-"}
        </span>
      )
    },
  }),
  columnHelper.accessor("closingBalance", {
    header: "Saldo Akhir",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-semibold text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("lineCount", {
    header: "Baris Mutasi",
    cell: (info) => (
      <span className="text-center block font-mono text-xs tabular-nums px-2 py-0.5 rounded bg-muted text-foreground">
        {info.getValue()} baris
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <div className="flex justify-center">
        <StatusChip
          status={info.getValue()}
          customLabel={statusLabel(info.getValue())}
          customTone={info.getValue() === "draft" ? "warning" : "success"}
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
          href={entityHref("/keuangan/laporan-bank", info.row.original)}
          className="inline-flex min-h-11 sm:min-h-8 items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted text-foreground transition-colors"
          title="Lihat Rincian Mutasi"
        >
          <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Detail</span>
        </Link>
      </div>
    ),
  }),
]

interface BankStatementTableProps {
  data: BankStatementRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function BankStatementTable({
  data,
  total,
  page,
  pageSize,
  toolbar,
  filters,
}: BankStatementTableProps) {
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
