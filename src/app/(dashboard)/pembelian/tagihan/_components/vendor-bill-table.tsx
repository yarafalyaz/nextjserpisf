"use client"

import { createColumnHelper } from "@tanstack/react-table"
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
}

const columnHelper = createColumnHelper<VendorBill>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/pembelian/tagihan/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "vendorName",
    header: "Vendor",
    cell: (info) => info.row.original.vendor.name,
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
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/pembelian/tagihan/${info.row.original.id}`}
        deleteAction={deleteVendorBill}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface VendorBillTableProps {
  data: VendorBill[]
}

export function VendorBillTable({ data }: VendorBillTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar vendor bill"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("vendorBill", ids)}
    />
  )
}
