"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteJournal } from "@/actions/finance.actions"
import { formatDate, formatReferenceType } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface JournalData {
  id: number
  journalNumber: string
  transactionDate: string
  referenceType: string | null
  description: string | null
  _count?: { entries: number }
}

const columnHelper = createColumnHelper<JournalData>()

const columns = [
  columnHelper.accessor("transactionDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("journalNumber", {
    header: "No. Dokumen",
    // The linked journal number is the card's headline; the date becomes a detail line.
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={`/keuangan/jurnal/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("referenceType", {
    header: "Referensi",
    cell: (info) => formatReferenceType(info.getValue()) || "-",
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => {
      const val = info.getValue()
      if (!val) return "-"
      return val.length > 50 ? val.slice(0, 50) + "..." : val
    },
  }),
  columnHelper.display({
    id: "entriesCount",
    header: "Baris",
    cell: (info) => info.row.original._count?.entries ?? 0,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/jurnal/${info.row.original.id}`}
        deleteAction={deleteJournal}
        deleteId={info.row.original.id}
        editPermission="edit_journals"
        deletePermission="delete_journals"
      />
    ),
  }),
]

interface JournalTableProps {
  data: JournalData[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function JournalTable({ data, toolbar, filters }: JournalTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar journal"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("journal", ids)}
    />
  )
}
