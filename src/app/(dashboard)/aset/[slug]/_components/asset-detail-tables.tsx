"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { ASSET_HISTORY_TYPE_LABELS, labelFrom } from "@/lib/utils/status-labels"
import { fiscalMethodLabel } from "../../_components/asset-fiscal-status"

export interface AssetFiscalYearRow {
  id: number
  taxYear: number
  method: string
  source: string
  openingBalance: number
  depreciation: number
  closingBalance: number
}

const fiscalColumnHelper = createColumnHelper<AssetFiscalYearRow>()

const fiscalColumns = [
  fiscalColumnHelper.accessor("taxYear", {
    header: "Tahun Pajak",
    meta: { mobilePrimary: true },
  }),
  fiscalColumnHelper.accessor("method", {
    header: "Metode",
    cell: (info) => fiscalMethodLabel(info.getValue()),
  }),
  fiscalColumnHelper.accessor("source", {
    header: "Sumber",
  }),
  fiscalColumnHelper.accessor("openingBalance", {
    header: "Saldo Awal",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  fiscalColumnHelper.accessor("depreciation", {
    header: "Penyusutan",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  fiscalColumnHelper.accessor("closingBalance", {
    header: "Saldo Akhir",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
]

export function AssetFiscalYearTable({ data }: { data: AssetFiscalYearRow[] }) {
  return (
    <DataTable
      data={data}
      columns={fiscalColumns}
      ariaLabel="Saldo fiskal tahunan aset"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface AssetHistoryRow {
  id: number
  date: string
  type: string
  description: string | null
  amount: number | null
}

const historyColumnHelper = createColumnHelper<AssetHistoryRow>()

const historyColumns = [
  historyColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  historyColumnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => (
      <StatusChip
        status={info.getValue()}
        customLabel={labelFrom(ASSET_HISTORY_TYPE_LABELS, info.getValue())}
      />
    ),
  }),
  historyColumnHelper.accessor("description", {
    header: "Deskripsi",
    meta: { mobilePrimary: true },
    cell: (info) => info.getValue() || "-",
  }),
  historyColumnHelper.accessor("amount", {
    header: "Nilai",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {info.getValue() != null ? formatCurrencyExact(info.getValue()!) : "-"}
      </div>
    ),
  }),
]

export function AssetHistoryTable({ data }: { data: AssetHistoryRow[] }) {
  return (
    <DataTable
      data={data}
      columns={historyColumns}
      ariaLabel="Riwayat aset"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface AssetTransferRow {
  id: number
  transferDate: string
  fromLocation: string | null
  toLocation: string
  notes: string | null
}

const transferColumnHelper = createColumnHelper<AssetTransferRow>()

const transferColumns = [
  transferColumnHelper.accessor("transferDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  transferColumnHelper.accessor("fromLocation", {
    header: "Dari",
    cell: (info) => info.getValue() || "-",
  }),
  transferColumnHelper.accessor("toLocation", {
    header: "Ke",
    meta: { mobilePrimary: true },
  }),
  transferColumnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
]

export function AssetTransferTable({ data }: { data: AssetTransferRow[] }) {
  return (
    <DataTable
      data={data}
      columns={transferColumns}
      ariaLabel="Riwayat transfer aset"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
