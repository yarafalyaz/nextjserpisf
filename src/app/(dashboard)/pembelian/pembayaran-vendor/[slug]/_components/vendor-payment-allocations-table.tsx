"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface VendorPaymentAllocationRow {
  id: number
  vendorBillId: number
  vendorBill: {
    id: number
    slug: string | null
    documentNo: string
  } | null
  amount: number
}

const columnHelper = createColumnHelper<VendorPaymentAllocationRow>()

const columns = [
  columnHelper.display({
    id: "bill",
    header: "No. Tagihan",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const alloc = info.row.original
      return alloc.vendorBill ? (
        <Link
          href={entityHref("/pembelian/tagihan", alloc.vendorBill)}
          className="font-medium text-primary hover:underline font-mono"
        >
          {alloc.vendorBill.documentNo}
        </Link>
      ) : (
        `Tagihan #${alloc.vendorBillId}`
      )
    },
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah Alokasi",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function VendorPaymentAllocationsTable({
  data,
}: Readonly<{ data: VendorPaymentAllocationRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Alokasi Pembayaran"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
