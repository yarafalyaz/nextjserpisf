"use client"

import Link from "next/link"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVendorPrice } from "@/actions/vendor-price.actions"
import { formatAccountingExact } from "@/lib/utils/format"

interface VendorPriceRow {
  id: number
  vendorName: string
  itemLabel: string
  minQty: number
  price: number
  effectiveDate: string | null
}

const columnHelper = createColumnHelper<VendorPriceRow>()

function buildColumns(canEdit: boolean) {
  return [
  columnHelper.accessor("vendorName", { header: "Pemasok" }),
  columnHelper.accessor("itemLabel", { header: "Barang" }),
  columnHelper.accessor("minQty", {
    header: "Min. Jml",
    cell: (info) => <span className="tabular-nums">{formatAccountingExact(info.getValue())}</span>,
  }),
  columnHelper.accessor("price", {
    header: "Harga",
    cell: (info) => <span className="tabular-nums">{formatAccountingExact(info.getValue())}</span>,
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
        {/* Tautan Ubah menuju halaman `edit_vendor_prices`; peran lihat-saja
            yang melihatnya akan terpental diam ke dasbor. */}
        {canEdit && (
          <Link
            href={`/pembelian/harga-pemasok/${info.row.original.id}/ubah`}
            className="text-sm text-primary hover:underline"
          >
            Ubah
          </Link>
        )}
        <ActionDropdown
          deleteAction={deleteVendorPrice}
          deleteId={info.row.original.id}
          deletePermission="delete_vendor_prices"
        />
      </div>
    ),
  }),
  ]
}

export function VendorPriceTable({
  data,
  canEdit = false,
}: {
  data: VendorPriceRow[]
  /** edit_vendor_prices — dihitung server di halaman pemanggil. */
  canEdit?: boolean
}) {
  return (
    <DataTable
      data={data}
      columns={buildColumns(canEdit)}
      ariaLabel="Daftar harga pemasok"
      searchColumn="vendorName"
      searchPlaceholder="Cari pemasok..."
    />
  )
}
