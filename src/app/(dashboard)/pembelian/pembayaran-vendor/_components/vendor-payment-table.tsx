"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVendorPayment } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface VendorPayment {
  id: number
  slug: string | null
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
      <Link href={entityHref("/pembelian/pembayaran-vendor", info.row.original)} className="text-foreground hover:underline font-medium font-mono">
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
        viewHref={entityHref("/pembelian/pembayaran-vendor", info.row.original)}
        deleteAction={deleteVendorPayment}
        deleteId={info.row.original.id}
        editPermission="edit_vendor_payments"
        deletePermission="delete_vendor_payments"
      />
    ),
  }),
]

interface VendorPaymentTableProps {
  data: VendorPayment[]
  total: number
  page: number
  pageSize: number
}

export function VendorPaymentTable({ data, total, page, pageSize }: VendorPaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pembayaran vendor"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. dokumen atau vendor..."
      onBulkDelete={(ids) => bulkDelete("vendorPayment", ids)}
    />
  )
}
