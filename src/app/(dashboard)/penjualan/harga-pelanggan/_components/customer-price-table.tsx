"use client"

import Link from "next/link"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
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
  expiresAt: string | null
  expiryStatusLabel: string
  expiryStatus: string
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
  columnHelper.accessor("expiresAt", {
    header: "Berlaku Sampai",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {info.getValue() ? formatDate(info.getValue()!) : "—"}
      </span>
    ),
  }),
  columnHelper.accessor("expiryStatusLabel", {
    header: "Status Masa",
    cell: (info) => {
      const status = info.row.original.expiryStatus
      const tone =
        status === "berlaku" || status === "tanpa_batas"
          ? "success"
          : status === "segera_berakhir" || status === "belum_berlaku"
            ? "warning"
            : status === "sudah_berakhir" || status === "nonaktif"
              ? "danger"
              : "default"
      return <StatusChip status={status} customLabel={info.getValue()} customTone={tone} />
    },
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

export function CustomerPriceTable({
  data,
  expiringRows,
}: {
  data: CustomerPriceRow[]
  expiringRows?: CustomerPriceRow[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={data}
        columns={columns}
        ariaLabel="Daftar harga pelanggan"
        searchColumn="itemLabel"
        searchPlaceholder="Cari barang..."
      />
      {expiringRows && expiringRows.length > 0 ? (
        <section aria-label="Harga segera berakhir" className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Segera Berakhir</h2>
            <p className="text-sm text-muted-foreground">
              Harga aktif dengan tanggal berakhir dalam jendela 30 hari.
            </p>
          </div>
          <DataTable
            data={expiringRows}
            columns={columns}
            ariaLabel="Harga segera berakhir"
            searchColumn="itemLabel"
            searchPlaceholder="Cari barang..."
          />
        </section>
      ) : null}
    </div>
  )
}
