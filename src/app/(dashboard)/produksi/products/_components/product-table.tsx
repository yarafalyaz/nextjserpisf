"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteProduct } from "@/actions/manufacturing.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Product {
  id: number
  name: string
  materials: { id: number }[]
}

const columnHelper = createColumnHelper<Product>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/produksi/products/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.materials.length, {
    id: "materialsCount",
    header: "Material",
    cell: (info) => `${info.getValue()} material`,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/produksi/products/${info.row.original.id}`}
        editHref={`/produksi/products/${info.row.original.id}/ubah`}
        deleteAction={deleteProduct}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ProductTableProps {
  data: Product[]
}

export function ProductTable({ data }: ProductTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar produk"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama produk..."
      onBulkDelete={(ids) => bulkDelete("product", ids)}
    />
  )
}
