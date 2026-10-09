"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCustomerCategory } from "@/actions/master.actions"
import { entityEditHref } from "@/lib/utils/entity-url"

interface CustomerCategory {
  id: number
  name: string
  slug: string | null
  downPaymentPercent: number
}

const columnHelper = createColumnHelper<CustomerCategory>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Kategori",
    cell: (info) => (
      <span className="text-foreground font-medium">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("downPaymentPercent", {
    header: "Persentase DP (%)",
    cell: (info) => `${Number(info.getValue())}%`,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={entityEditHref("/master/kategori-pelanggan", info.row.original)}
        deleteAction={deleteCustomerCategory}
        deleteId={info.row.original.id}
        editPermission="edit_customers"
        deletePermission="delete_customers"
      />
    ),
  }),
]

interface CustomerCategoryTableProps {
  data: CustomerCategory[]
  total: number
  page: number
  pageSize: number
}

export function CustomerCategoryTable({ data, total, page, pageSize }: CustomerCategoryTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kategori pelanggan"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari nama kategori..."
    />
  )
}
