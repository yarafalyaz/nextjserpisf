"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface MyReimbursementClaimRow {
  id: number
  slug?: string | null
  documentNo: string
  employeeName: string | null
  amount: number
  date: string | Date
  referenceNo: string | null
  description: string | null
  categoryLabel: string | null
  status: string
  stage: string
  stageLabel: string
  hasAccrualJournal: boolean
  hasPaymentJournal: boolean
}

const columnHelper = createColumnHelper<MyReimbursementClaimRow>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={entityHref("/keuangan/pengeluaran", info.row.original)}
        className="text-foreground hover:underline font-mono"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("description", {
    header: "Keterangan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("categoryLabel", {
    header: "Kategori",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("referenceNo", {
    header: "No. Nota",
    cell: (info) =>
      info.getValue() || (
        <span className="text-muted-foreground">Belum ada nomor nota tercatat</span>
      ),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("stageLabel", {
    header: "Tahap",
    // stageLabel verbatim server (AC-RB-F1) — UI tidak menurunkan tahap sendiri.
    cell: (info) => (
      <span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
]

interface MyReimbursementClaimsTableProps {
  data: MyReimbursementClaimRow[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function MyReimbursementClaimsTable({ data, toolbar, filters }: MyReimbursementClaimsTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar klaim reimbursement saya"
      pageSize={20}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
