"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatAccountingExact, formatDate } from "@/lib/utils/format"

export interface PaymentOrderRow {
  id: number | string
  vendorName: string
  documentNo: string
  date: string
  dueDate: string | null
  ageBucket: string
  remaining: number
}

export interface PaymentOrderVendorSubtotal {
  vendorId: number
  vendorName: string
  total: number
}

const columnHelper = createColumnHelper<PaymentOrderRow>()

const columns = [
  columnHelper.accessor("vendorName", {
    header: "Pemasok",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor("documentNo", {
    header: "No. Tagihan",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("dueDate", {
    header: "Jatuh Tempo",
    cell: (info) => {
      const val = info.getValue()
      return val ? formatDate(val) : "Tanpa jatuh tempo"
    },
  }),
  columnHelper.accessor("ageBucket", {
    header: "Umur",
  }),
  columnHelper.accessor("remaining", {
    header: "Sisa (Rp)",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {formatAccountingExact(info.getValue(), { zeroDash: false })}
      </span>
    ),
  }),
]

export function PaymentOrderTable({
  rows,
  subtotals,
  total,
}: Readonly<{
  rows: PaymentOrderRow[]
  subtotals: PaymentOrderVendorSubtotal[]
  total: number
}>) {
  return (
    <div className="space-y-3">
      <DataTable
        data={rows}
        columns={columns}
        ariaLabel="Perintah Pembayaran"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="rounded-lg border border-default bg-surface-secondary/40 px-4 py-3 text-sm space-y-1.5">
        {subtotals.map((group) => (
          <div key={group.vendorId} className="flex items-center justify-between text-muted-foreground">
            <span className="font-medium text-foreground">Subtotal {group.vendorName}</span>
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {formatAccountingExact(group.total, { zeroDash: false })}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-default pt-2 font-bold">
          <span>TOTAL AKAN DIBAYAR</span>
          <span className="font-mono tabular-nums">
            {formatAccountingExact(total, { zeroDash: false })}
          </span>
        </div>
      </div>
    </div>
  )
}
