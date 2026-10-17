"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteProfitCenter } from "@/actions/finance.actions"
import { entityEditHref } from "@/lib/utils/entity-url"

interface ProfitCenterData {
  id: number
  code: string
  name: string
}

const columnHelper = createColumnHelper<ProfitCenterData>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={entityEditHref("/keuangan/pusat-laba", info.row.original)}
        deleteAction={deleteProfitCenter}
        deleteId={info.row.original.id}
        deletePermission="delete_profit_centers"
      />
    ),
  }),
]

export function ProfitCenterTable({
  data,
  total,
  page,
  pageSize,
}: {
  data: ProfitCenterData[]
  total: number
  page: number
  pageSize: number
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      serverPagination={{ total, page, pageSize }}
      searchColumn="name"
      searchPlaceholder="Cari pusat laba..."
    />
  )
}
