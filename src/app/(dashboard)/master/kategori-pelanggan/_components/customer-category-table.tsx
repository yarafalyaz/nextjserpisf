"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCustomerCategory } from "@/actions/master.actions"

interface CustomerCategory {
  id: number
  name: string
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
        editHref={`/master/kategori-pelanggan/${info.row.original.id}/ubah`}
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
}

export function CustomerCategoryTable({ data }: CustomerCategoryTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kategori pelanggan"
      pageSize={20}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari nama kategori..."
    />
  )
}
