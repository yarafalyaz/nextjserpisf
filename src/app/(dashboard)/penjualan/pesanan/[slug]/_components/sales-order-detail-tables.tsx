"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface SalesOrderDeliveryRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  status: string
}

export interface SalesOrderInvoiceRow {
  id: number
  slug: string | null
  documentNo: string | null
  date: string
  grandTotal: number
  status: string
}

const doHelper = createColumnHelper<SalesOrderDeliveryRow>()
const doColumns = [
  doHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/penjualan/surat-jalan", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  doHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  doHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function SalesOrderDeliveriesTable({
  data,
}: Readonly<{ data: SalesOrderDeliveryRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={doColumns}
      ariaLabel="Surat Jalan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const invHelper = createColumnHelper<SalesOrderInvoiceRow>()
const invColumns = [
  invHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/penjualan/faktur", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  invHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  invHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  invHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function SalesOrderInvoicesTable({
  data,
}: Readonly<{ data: SalesOrderInvoiceRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={invColumns}
      ariaLabel="Faktur Penjualan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
