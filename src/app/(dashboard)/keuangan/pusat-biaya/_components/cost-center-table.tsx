"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCostCenter } from "@/actions/finance.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface CostCenterData {
  id: number
  code: string
  name: string
}

const columnHelper = createColumnHelper<CostCenterData>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/keuangan/pusat-biaya/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/pusat-biaya/${info.row.original.id}`}
        editHref={`/keuangan/pusat-biaya/${info.row.original.id}/ubah`}
        deleteAction={deleteCostCenter}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface CostCenterTableProps {
  data: CostCenterData[]
}

export function CostCenterTable({ data }: CostCenterTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar cost center"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari kode atau nama..."
      onBulkDelete={(ids) => bulkDelete("costCenter", ids)}
    />
  )
}
