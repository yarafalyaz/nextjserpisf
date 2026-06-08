"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteItem } from "@/actions/master.actions"
import { formatCurrency } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface Item {
  id: number
  sku: string
  name: string
  category: { name: string } | null
  qtyOnHand: number
  minStock: number
  price: number
}

const columnHelper = createColumnHelper<Item>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <div>
        <Link href={`/master/barang/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">
          {info.row.original.sku || "-"} | {info.row.original.category?.name || "-"}
        </p>
      </div>
    ),
  }),
  columnHelper.accessor("qtyOnHand", {
    header: "Stok",
    cell: (info) => {
      const qty = Number(info.getValue())
      const minStock = Number(info.row.original.minStock)
      const isDanger = minStock > 0 && qty <= minStock
      return (
        <div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isDanger ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
            {qty.toLocaleString("id-ID")}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">Min: {minStock.toLocaleString("id-ID")}</p>
        </div>
      )
    },
  }),
  columnHelper.accessor("price", {
    header: "Harga Jual",
    cell: (info) => formatCurrency(Number(info.getValue())),
  }),
  columnHelper.accessor((row) => row.category?.name, {
    id: "categoryName",
    header: "Kategori",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/master/barang/${info.row.original.id}`}
        editHref={`/master/barang/${info.row.original.id}/ubah`}
        deleteAction={deleteItem}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ItemTableProps {
  data: Item[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function ItemTable({ data, toolbar, filters }: ItemTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar item"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("item", ids)}
    />
  )
}
