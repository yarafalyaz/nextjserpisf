"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePettyCash } from "@/actions/finance.actions"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { StatusChip } from "@/components/ui/status-chip"
import { TrendingUp, TrendingDown } from "@/components/ui/fontawesome-icons"

interface PettyCashData {
  id: number
  slug: string | null
  documentNo: string
  date: string
  type: string
  description: string | null
  amount: number
  balanceAfter: number
  projectName: string | null
  vendorName: string | null
  categoryName: string | null
}

const columnHelper = createColumnHelper<PettyCashData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={entityHref("/keuangan/kas-kecil", info.row.original)}
        className="font-medium text-primary hover:underline font-mono text-xs inline-flex min-h-11 sm:min-h-9 items-center"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => {
      const type = info.getValue()
      const isExpense = type === "OUT" || type === "expense"
      return (
        <div className="inline-flex items-center gap-1.5">
          {isExpense ? (
            <TrendingDown className="size-3 text-red-600 dark:text-red-400" aria-hidden="true" />
          ) : (
            <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          )}
          <StatusChip status={type} customLabel={statusLabel(type)} />
        </div>
      )
    },
  }),
  columnHelper.accessor("description", {
    header: "Keterangan",
    cell: (info) => (
      <span className="text-xs text-foreground line-clamp-1 max-w-[220px]" title={info.getValue() || undefined}>
        {info.getValue() || "-"}
      </span>
    ),
  }),
  columnHelper.accessor("categoryName", {
    header: "Kategori",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">
        {info.getValue() || "-"}
      </span>
    ),
  }),
  columnHelper.accessor("projectName", {
    header: "Proyek",
    cell: (info) => (
      <span className="text-xs text-muted-foreground truncate max-w-[160px] block" title={info.getValue() || undefined}>
        {info.getValue() || "-"}
      </span>
    ),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => {
      const isExpense = info.row.original.type === "OUT" || info.row.original.type === "expense"
      return (
        <span className={`text-right block font-mono text-xs font-semibold tabular-nums ${isExpense ? "text-foreground" : "text-emerald-600 dark:text-emerald-400"}`}>
          {formatCurrencyExact(info.getValue())}
        </span>
      )
    },
  }),
  columnHelper.accessor("balanceAfter", {
    header: "Saldo Setelah",
    cell: (info) => (
      <span className="text-right block font-mono text-xs tabular-nums text-muted-foreground">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/keuangan/kas-kecil", info.row.original)}
        deleteAction={deletePettyCash}
        deleteId={info.row.original.id}
        deletePermission="delete_petty_cash"
        // deletePettyCash menolak alasan kosong (void beralasan, GL-BR-003
        // P6). Tanpa label ini ActionDropdown memanggil action(id) tanpa
        // argumen kedua, jadi menu Hapus selalu gagal dari daftar.
        deleteReasonLabel="Alasan pembatalan"
        deleteConfirmTitle="Batalkan transaksi kas kecil ini?"
        deleteConfirmBody="Transaksi ditandai dibatalkan (void) dan jurnal aslinya dibalik, tetapi barisnya tetap tersimpan untuk jejak audit."
      />
    ),
  }),
]

interface PettyCashTableProps {
  data: PettyCashData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function PettyCashTable({ data, total, page, pageSize, toolbar, filters }: PettyCashTableProps) {
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
