"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { FileText } from "@/components/ui/fontawesome-icons"

export interface TaxInvoiceRow {
  id: number
  slug: string | null
  taxInvoiceNumber: string
  direction: "out" | "in"
  transactionCode: string
  taxInvoiceDate: string
  taxPeriod: string
  dpp: number
  taxRate: number
  taxAmount: number
  djpStatus: string
  counterpartyName: string | null
  counterpartyTaxId: string | null
  creditStatus: string | null
}

const columnHelper = createColumnHelper<TaxInvoiceRow>()

const columns = [
  columnHelper.accessor("taxInvoiceNumber", {
    header: "Nomor Faktur",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
            <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>{row.taxInvoiceNumber}</span>
          </div>
          <span className="block text-[11px] text-muted-foreground font-mono">
            Kode Trx: {row.transactionCode} · Masa: {row.taxPeriod}
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("direction", {
    header: "Jenis Faktur",
    cell: (info) => {
      const isOut = info.getValue() === "out"
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
            isOut
              ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
              : "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
          }`}
        >
          <span>{isOut ? "Pajak Keluaran (PK)" : "Pajak Masukan (PM)"}</span>
        </span>
      )
    },
  }),
  columnHelper.accessor("taxInvoiceDate", {
    header: "Tanggal",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("counterpartyName", {
    header: "Lawan Transaksi",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <span className="block text-xs font-medium text-foreground">
            {row.counterpartyName || "Tanpa Nama"}
          </span>
          <span className="block text-[11px] text-muted-foreground font-mono">
            NPWP: {row.counterpartyTaxId || "—"}
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("dpp", {
    header: "DPP (Harga Jual)",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-medium text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("taxAmount", {
    header: "PPN Tercatat",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-semibold text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("djpStatus", {
    header: "Status DJP",
    cell: (info) => {
      const val = info.getValue()
      const toneMap: Record<string, "success" | "warning" | "danger" | "default"> = {
        approved: "success",
        draft: "warning",
        rejected: "danger",
        cancelled: "danger",
        replaced: "default",
      }
      return (
        <div className="flex justify-center">
          <StatusChip
            status={val}
            customLabel={val.toUpperCase()}
            customTone={toneMap[val] ?? "default"}
          />
        </div>
      )
    },
  }),
]

interface TaxInvoiceTableProps {
  data: TaxInvoiceRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function TaxInvoiceTable({
  data,
  total,
  page,
  pageSize,
  toolbar,
  filters,
}: TaxInvoiceTableProps) {
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
