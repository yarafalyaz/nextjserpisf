"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCurrency } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Currency {
  id: number
  code: string
  name: string
  rate: number | string
}

const columnHelper = createColumnHelper<Currency>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <Link href={`/master/mata-uang/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("rate", {
    header: "Rate",
    cell: (info) => Number(info.getValue()).toLocaleString("id-ID", { minimumFractionDigits: 4 }),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/mata-uang/${info.row.original.id}/ubah`}
        deleteAction={deleteCurrency}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface CurrencyTableProps {
  data: Currency[]
}

export function CurrencyTable({ data }: CurrencyTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar mata uang"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("currency", ids)}
    />
  )
}
