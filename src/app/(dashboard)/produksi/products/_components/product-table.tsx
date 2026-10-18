"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteProduct } from "@/actions/manufacturing.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Product {
  id: number
  name: string
  slug: string | null
  materialsCount: number
}

const columnHelper = createColumnHelper<Product>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/produksi/products", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("materialsCount", {
    header: "Bahan",
    cell: (info) => `${info.getValue()} bahan`,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/produksi/products", info.row.original)}
        editHref={entityEditHref("/produksi/products", info.row.original)}
        deleteAction={deleteProduct}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ProductTableProps {
  data: Product[]
  total: number
  page: number
  pageSize: number
}

export function ProductTable({ data, total, page, pageSize }: ProductTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar produk"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama produk..."
      onBulkDelete={(ids) => bulkDelete("product", ids)}
    />
  )
}
