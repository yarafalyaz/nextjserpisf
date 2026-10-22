"use client"

import Link from "next/link"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCustomerPriceList } from "@/actions/customer-price-list.actions"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"

export interface CustomerPriceRow {
  id: number
  categoryName: string
  itemLabel: string
  unit: string
  minQty: number
  price: number
  effectiveDate: string | null
  notes: string | null
}

const columnHelper = createColumnHelper<CustomerPriceRow>()

const columns = [
  columnHelper.accessor("categoryName", { header: "Kategori Pelanggan" }),
  columnHelper.accessor("itemLabel", { header: "Barang" }),
  columnHelper.accessor("minQty", {
    header: "Min. Qty",
    cell: (info) => (
      <span className="tabular-nums">
        {formatNumber(info.getValue())} {info.row.original.unit}
      </span>
    ),
  }),
  columnHelper.accessor("price", {
    header: "Harga",
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor("effectiveDate", {
    header: "Berlaku Sejak",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {info.getValue() ? formatDate(info.getValue()!) : "—"}
      </span>
    ),
  }),
  columnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/penjualan/harga-pelanggan/${info.row.original.id}/ubah`}
          className="text-sm text-primary hover:underline"
        >
          Ubah
        </Link>
        <ActionDropdown
          deleteAction={deleteCustomerPriceList}
          deleteId={info.row.original.id}
          deletePermission="delete_customer_price_lists"
        />
      </div>
    ),
  }),
]

export function CustomerPriceTable({ data }: { data: CustomerPriceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar harga pelanggan"
      searchColumn="itemLabel"
      searchPlaceholder="Cari barang..."
    />
  )
}
