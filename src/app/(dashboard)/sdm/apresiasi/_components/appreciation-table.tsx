"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAppreciation } from "@/actions/hrm.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface AppreciationData {
  id: number
  employee: { name: string }
  date: string
  type: string
  amount: number
  notes: string | null
}

const columnHelper = createColumnHelper<AppreciationData>()

const typeLabels: Record<string, string> = {
  bonus: "Bonus",
  reward: "Reward",
  incentive: "Insentif",
}

const columns = [
  columnHelper.display({
    id: "no",
    header: "No",
    cell: (info) => info.row.index + 1,
  }),
  columnHelper.accessor("employee", {
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/sdm/apresiasi/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue().name}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => typeLabels[info.getValue()] || info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/apresiasi/${info.row.original.id}`}
        editHref={`/sdm/apresiasi/${info.row.original.id}/ubah`}
        deleteAction={deleteAppreciation}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface AppreciationTableProps {
  data: AppreciationData[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function AppreciationTable({ data, toolbar, filters }: AppreciationTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar apresiasi karyawan"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("appreciation", ids)}
    />
  )
}
