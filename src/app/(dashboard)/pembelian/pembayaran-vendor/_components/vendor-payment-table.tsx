"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { confirmVendorPayment, deleteVendorPayment } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface VendorPayment {
  id: number
  slug: string | null
  documentNo: string
  paymentDate: Date | string
  amount: number | string
  paymentMethod: string
  status: string
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
    header: "Pemasok",
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
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/pembelian/pembayaran-vendor", info.row.original)}
        deleteAction={info.row.original.status === "reversed" ? undefined : deleteVendorPayment}
        deleteId={info.row.original.id}
        editPermission="edit_vendor_payments"
        deletePermission="delete_vendor_payments"
        // Konfirmasi hanya masuk akal dari draft; aksinya sendiri juga memeriksa ini dan
        // memposting jurnal + mengalokasikan ke tagihan terbuka.
        processAction={info.row.original.status === "draft" ? confirmVendorPayment : undefined}
        processLabel="Konfirmasi & Posting"
        processConfirmTitle="Konfirmasi pembayaran ini?"
        processConfirmBody="Jurnal kas/bank akan diposting dan pembayaran dialokasikan ke tagihan vendor yang masih terbuka (tertua lebih dulu). Tindakan ini tidak bisa dibatalkan."
        processSuccessMessage="Pembayaran dikonfirmasi & diposting"
        processPermission="approve_vendor_payments"
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
      ariaLabel="Daftar pembayaran pemasok"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. dokumen atau pemasok..."
      onBulkDelete={(ids) => bulkDelete("vendorPayment", ids)}
    />
  )
}
