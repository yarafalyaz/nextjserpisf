"use client"

import Link from "next/link"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVendorPrice } from "@/actions/vendor-price.actions"
import { formatAccounting } from "@/lib/utils/format"

interface VendorPriceRow {
  id: number
  vendorName: string
  itemLabel: string
  minQty: number
  price: number
  effectiveDate: string | null
}

const columnHelper = createColumnHelper<VendorPriceRow>()

const columns = [
  columnHelper.accessor("vendorName", { header: "Pemasok" }),
  columnHelper.accessor("itemLabel", { header: "Barang" }),
  columnHelper.accessor("minQty", {
    header: "Min. Jml",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.accessor("price", {
    header: "Harga",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.accessor("effectiveDate", {
    header: "Berlaku",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/pembelian/harga-pemasok/${info.row.original.id}/ubah`}
          className="text-sm text-primary hover:underline"
        >
          Ubah
        </Link>
        <ActionDropdown
          deleteAction={deleteVendorPrice}
          deleteId={info.row.original.id}
          deletePermission="delete_vendor_prices"
        />
      </div>
    ),
  }),
]

export function VendorPriceTable({ data }: { data: VendorPriceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar harga pemasok"
      searchColumn="vendorName"
      searchPlaceholder="Cari pemasok..."
    />
  )
}
