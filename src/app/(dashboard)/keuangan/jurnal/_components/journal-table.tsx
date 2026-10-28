"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteJournal, postJournal } from "@/actions/finance.actions"
import { formatDate, formatReferenceType } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface JournalData {
  id: number
  slug: string | null
  journalNumber: string
  transactionDate: string
  referenceType: string | null
  status: string
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
      <Link href={entityHref("/keuangan/jurnal", info.row.original)} className="text-foreground hover:underline font-mono">
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
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <span className="text-sm">{statusLabel(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/keuangan/jurnal", info.row.original)}
        deleteAction={deleteJournal}
        deleteId={info.row.original.id}
        // GL-BR-003 K2: jurnal terposting hanya lewat reversal beralasan —
        // Hapus + Bulk harus ditolak dengan pesan yang mengarahkan, bukan
        // dibiarkan dicoba lalu pasti gagal. Penolakan tetap fail-closed
        // di deleteJournal/bulkDelete server.
        deleteConfirmTitle={
          info.row.original.status?.toUpperCase() !== "DRAFT"
            ? `Jurnal ${info.row.original.journalNumber} sudah terposting`
            : undefined
        }
        deleteConfirmBody={
          info.row.original.status?.toUpperCase() !== "DRAFT"
            ? "Jurnal terposting tidak bisa dihapus. Koreksi hanya lewat jurnal pembalik (reversal) beralasan agar jejak audit utuh."
            : undefined
        }
        editPermission="edit_journals"
        deletePermission="delete_journals"
        // Jurnal manual dibuat DRAFT dan hanya `postJournal` yang mempostingnya; tanpa
        // tombol ini jurnal tak pernah masuk pembukuan (laporan membaca POSTED/REVERSED).
        // Status di DB huruf besar ("DRAFT"), jadi perbandingannya tidak case-sensitive.
        processAction={
          info.row.original.status?.toUpperCase() === "DRAFT" ? postJournal : undefined
        }
        processLabel="Posting"
        processConfirmTitle="Posting jurnal ini?"
        processConfirmBody="Jurnal akan berstatus terposting sehingga masuk ke laporan keuangan (buku besar, neraca, laba rugi). Pastikan akun dan nominalnya sudah benar."
        processSuccessMessage="Jurnal berhasil diposting"
        processPermission="post_journals"
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
      ariaLabel="Daftar jurnal"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("journal", ids)}
    />
  )
}
