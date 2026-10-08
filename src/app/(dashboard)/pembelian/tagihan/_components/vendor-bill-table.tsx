"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVendorBill } from "@/actions/purchase.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface VendorBill {
  id: number
  documentNo: string
  date: Date | string
  grandTotal: number | string
  status: string
  vendor: { name: string }
  purchaseOrder?: { documentNo: string; isService: boolean } | null
}

const columnHelper = createColumnHelper<VendorBill>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/pembelian/tagihan/${info.row.original.id}`} className="text-foreground hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "vendorName",
    header: "Vendor",
    cell: (info) => info.row.original.vendor.name,
  }),
  columnHelper.display({
    id: "po",
    header: "PO",
    cell: (info) => {
      const po = info.row.original.purchaseOrder
      if (!po) return <span className="text-muted-foreground">-</span>
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-xs">{po.documentNo}</span>
          {po.isService && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
              Jasa
            </span>
          )}
        </span>
      )
    },
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("grandTotal", {
    header: "Total Keseluruhan",
    cell: (info) => formatCurrency(Number(info.getValue())),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "bayar",
    header: "Bayar",
    enableSorting: false,
    cell: (info) => {
      const b = info.row.original
      const payable = b.status !== "draft" && b.status !== "cancelled" && b.status !== "paid"
      if (!payable) return <span className="text-muted-foreground">-</span>
      return (
        <Link
          href={`/pembelian/pembayaran-vendor/tambah?billId=${b.id}`}
          className="text-primary hover:underline font-medium"
        >
          Bayar
        </Link>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/pembelian/tagihan/${info.row.original.id}`}
        deleteAction={deleteVendorBill}
        deleteId={info.row.original.id}
        editPermission="edit_vendor_bills"
        deletePermission="delete_vendor_bills"
      />
    ),
  }),
]

interface VendorBillTableProps {
  data: VendorBill[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function VendorBillTable({ data, toolbar, filters }: VendorBillTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar vendor bill"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("vendorBill", ids)}
    />
  )
}
