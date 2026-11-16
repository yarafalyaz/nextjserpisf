"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface InvoiceDownPaymentRow {
  id: number
  documentNo: string
  paymentDate: string
  paymentMethodName: string
  status: string
  amount: number
}

export interface InvoicePaymentRow {
  id: number
  documentNo: string
  paymentDate: string
  paymentMethodName: string
  amount: number
}

export interface InvoiceReturnRow {
  id: number
  slug?: string | null
  documentNo: string
  date: string
  status: string
}

const dpHelper = createColumnHelper<InvoiceDownPaymentRow>()
const dpColumns = [
  dpHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  dpHelper.accessor("paymentDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  dpHelper.accessor("paymentMethodName", {
    header: "Metode",
  }),
  dpHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  dpHelper.accessor("amount", {
    header: "Nominal",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function InvoiceDownPaymentsTable({
  data,
  grandTotal,
}: Readonly<{ data: InvoiceDownPaymentRow[]; grandTotal: number }>) {
  const totalDownPayment = data.reduce((sum, dp) => sum + dp.amount, 0)
  const remaining = grandTotal - totalDownPayment

  return (
    <div className="space-y-3">
      <DataTable
        data={data}
        columns={dpColumns}
        ariaLabel="Riwayat Uang Muka"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="rounded-lg border border-default bg-surface-secondary/40 px-4 py-3 text-sm space-y-1.5">
        <div className="flex items-center justify-between font-bold">
          <span>Total Uang Muka</span>
          <span className="font-mono tabular-nums">{formatCurrencyExact(totalDownPayment)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Total Keseluruhan Faktur</span>
          <span className="font-mono tabular-nums">{formatCurrencyExact(grandTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-danger font-bold border-t border-default pt-1.5">
          <span>Sisa Setelah Uang Muka</span>
          <span className="font-mono tabular-nums">{formatCurrencyExact(remaining)}</span>
        </div>
      </div>
    </div>
  )
}

const payHelper = createColumnHelper<InvoicePaymentRow>()
const payColumns = [
  payHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  payHelper.accessor("paymentDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  payHelper.accessor("paymentMethodName", {
    header: "Metode",
  }),
  payHelper.accessor("amount", {
    header: "Jumlah",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function InvoicePaymentsTable({
  data,
}: Readonly<{ data: InvoicePaymentRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={payColumns}
      ariaLabel="Riwayat Pembayaran"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const retHelper = createColumnHelper<InvoiceReturnRow>()
const retColumns = [
  retHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/penjualan/retur", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  retHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  retHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function InvoiceReturnsTable({
  data,
}: Readonly<{ data: InvoiceReturnRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={retColumns}
      ariaLabel="Retur Penjualan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
