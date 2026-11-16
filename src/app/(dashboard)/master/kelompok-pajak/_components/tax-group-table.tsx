"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTaxGroup } from "@/actions/master.actions"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"

interface TaxGroup {
  id: number
  slug: string | null
  name: string
  taxNames: string
}

const columnHelper = createColumnHelper<TaxGroup>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/master/kelompok-pajak", info.row.original)} className="font-medium text-foreground hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("taxNames", {
    header: "Pajak Termasuk",
    enableSorting: false,
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/master/kelompok-pajak", info.row.original)}
        editHref={entityEditHref("/master/kelompok-pajak", info.row.original)}
        deleteAction={deleteTaxGroup}
        deleteId={info.row.original.id}
        editPermission="edit_taxes"
        deletePermission="delete_taxes"
      />
    ),
  }),
]

interface TaxGroupTableProps {
  data: TaxGroup[]
  total: number
  page: number
  pageSize: number
}

export function TaxGroupTable({ data, total, page, pageSize }: TaxGroupTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar grup pajak"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari nama grup pajak..."
    />
  )
}
