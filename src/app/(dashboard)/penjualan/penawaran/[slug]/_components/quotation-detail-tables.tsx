"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { FitmentBadge } from "@/components/reports/fitment-badge"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface QuotationDownPaymentRow {
  id: number
  amount: number
  status: string
  createdAt: string
}

export interface QuotationSectionItemRow {
  id: number
  itemId: number | null
  itemName: string | null
  itemSku: string | null
  fitmentResult: string | null
  fitmentRuleId: number | null
  description: string | null
  qty: number
  uom: string | null
  unitPrice: number
  discount: number
  total: number
}

const dpHelper = createColumnHelper<QuotationDownPaymentRow>()
const dpColumns = [
  dpHelper.accessor("amount", {
    header: "Jumlah",
    meta: { align: "right", mobilePrimary: true },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  dpHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  dpHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function QuotationDownPaymentsTable({
  data,
}: Readonly<{ data: QuotationDownPaymentRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={dpColumns}
      ariaLabel="Riwayat Pembayaran Uang Muka"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const itemHelper = createColumnHelper<QuotationSectionItemRow>()
const itemColumns = [
  itemHelper.display({
    id: "product",
    header: "Produk",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          {row.itemName ? (
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{row.itemName}</span>
              <span className="text-xs text-muted-foreground">{row.itemSku}</span>
            </div>
          ) : (
            `Barang #${row.itemId}`
          )}
          <FitmentBadge
            fitmentResult={row.fitmentResult}
            fitmentRuleId={row.fitmentRuleId}
          />
        </div>
      )
    },
  }),
  itemHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  itemHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  itemHelper.accessor("uom", {
    header: "Satuan",
    cell: (info) => info.getValue() || "-",
  }),
  itemHelper.accessor("unitPrice", {
    header: "Harga",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  itemHelper.accessor("discount", {
    header: "Diskon",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  itemHelper.accessor("total", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function QuotationSectionItemsTable({
  data,
}: Readonly<{ data: QuotationSectionItemRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={itemColumns}
      ariaLabel="Daftar Produk Penawaran"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
