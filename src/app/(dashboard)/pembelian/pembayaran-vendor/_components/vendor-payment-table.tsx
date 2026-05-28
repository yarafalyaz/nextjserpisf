"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVendorPayment } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface VendorPayment {
  id: number
  documentNo: string
  paymentDate: Date | string
  amount: number | string
  paymentMethod: string
  vendor: { name: string }
}

const columnHelper = createColumnHelper<VendorPayment>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/pembelian/pembayaran-vendor/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "vendorName",
    header: "Vendor",
    cell: (info) => info.row.original.vendor.name,
  }),
  columnHelper.accessor("paymentDate", {
    header: "Tanggal Bayar",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(Number(info.getValue())),
  }),
  columnHelper.accessor("paymentMethod", {
    header: "Metode",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/pembelian/pembayaran-vendor/${info.row.original.id}`}
        deleteAction={deleteVendorPayment}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface VendorPaymentTableProps {
  data: VendorPayment[]
}

export function VendorPaymentTable({ data }: VendorPaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pembayaran vendor"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("vendorPayment", ids)}
    />
  )
}
