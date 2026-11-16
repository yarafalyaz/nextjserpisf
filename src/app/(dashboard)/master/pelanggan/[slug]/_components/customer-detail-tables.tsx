"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface CustomerTaxInvoiceRow {
  id: number
  taxInvoiceNumber: string
  taxInvoiceDate: string
  counterpartyName: string | null
  npwpDisplay: string
  nitkuDisplay: string
}

const taxInvColumnHelper = createColumnHelper<CustomerTaxInvoiceRow>()

const taxInvColumns = [
  taxInvColumnHelper.accessor("taxInvoiceNumber", {
    header: "No. Faktur Pajak",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  taxInvColumnHelper.accessor("taxInvoiceDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  taxInvColumnHelper.accessor("counterpartyName", {
    header: "Nama Snapshot",
    cell: (info) => info.getValue() || "-",
  }),
  taxInvColumnHelper.accessor("npwpDisplay", {
    header: "NPWP Snapshot",
  }),
  taxInvColumnHelper.accessor("nitkuDisplay", {
    header: "NITKU Snapshot",
  }),
]

export function CustomerTaxInvoicesTable({ data }: { data: CustomerTaxInvoiceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={taxInvColumns}
      ariaLabel="Snapshot faktur pajak terbit"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface CustomerQuotationRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  grandTotal: number
  status: string
}

const quotColumnHelper = createColumnHelper<CustomerQuotationRow>()

const quotColumns = [
  quotColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/penjualan/penawaran", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  quotColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  quotColumnHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  quotColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function CustomerQuotationsTable({ data }: { data: CustomerQuotationRow[] }) {
  return (
    <DataTable
      data={data}
      columns={quotColumns}
      ariaLabel="Penawaran pelanggan terbaru"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface CustomerInvoiceRow {
  id: number
  slug: string | null
  documentNo: string | null
  date: string
  grandTotal: number
  paidAmount: number
  status: string
}

const invColumnHelper = createColumnHelper<CustomerInvoiceRow>()

const invColumns = [
  invColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/penjualan/faktur", info.row.original)} className="font-mono hover:underline">
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  invColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  invColumnHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  invColumnHelper.accessor("paidAmount", {
    header: "Terbayar",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  invColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function CustomerInvoicesTable({ data }: { data: CustomerInvoiceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={invColumns}
      ariaLabel="Faktur pelanggan terbaru"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface CustomerProjectRow {
  id: number
  slug: string | null
  name: string
  status: string
  startDate: string | null
  endDate: string | null
}

const projColumnHelper = createColumnHelper<CustomerProjectRow>()

const projColumns = [
  projColumnHelper.accessor("name", {
    header: "Nama Proyek",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/proyek", info.row.original)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  projColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  projColumnHelper.accessor("startDate", {
    header: "Tanggal Mulai",
    cell: (info) => (info.getValue() ? formatDate(info.getValue()!) : "-"),
  }),
  projColumnHelper.accessor("endDate", {
    header: "Tanggal Selesai",
    cell: (info) => (info.getValue() ? formatDate(info.getValue()!) : "-"),
  }),
]

export function CustomerProjectsTable({ data }: { data: CustomerProjectRow[] }) {
  return (
    <DataTable
      data={data}
      columns={projColumns}
      ariaLabel="Proyek pelanggan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface CustomerVehicleSummaryRow {
  id: number
  vehicleLabel: string
  plateNumber: string | null
  year: number | null
  color: string | null
}

const cvColumnHelper = createColumnHelper<CustomerVehicleSummaryRow>()

const cvColumns = [
  cvColumnHelper.accessor("vehicleLabel", {
    header: "Kendaraan",
    meta: { mobilePrimary: true },
  }),
  cvColumnHelper.accessor("plateNumber", {
    header: "Plat Nomor",
    cell: (info) => <span className="font-mono">{info.getValue() || "-"}</span>,
  }),
  cvColumnHelper.accessor("year", {
    header: "Tahun",
    cell: (info) => info.getValue() || "-",
  }),
  cvColumnHelper.accessor("color", {
    header: "Warna",
    cell: (info) => info.getValue() || "-",
  }),
]

export function CustomerVehiclesSummaryTable({ data }: { data: CustomerVehicleSummaryRow[] }) {
  return (
    <DataTable
      data={data}
      columns={cvColumns}
      ariaLabel="Kendaraan pelanggan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
