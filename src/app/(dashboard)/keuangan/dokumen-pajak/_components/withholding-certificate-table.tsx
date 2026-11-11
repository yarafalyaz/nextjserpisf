"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { Receipt } from "@/components/ui/fontawesome-icons"

export interface WithholdingCertificateRow {
  id: number
  slug: string | null
  certificateNumber: string
  direction: "we_withhold" | "withheld_from_us"
  withholdingDate: string
  taxPeriod: string
  article: string
  objectCode: string | null
  objectName: string | null
  dpp: number
  tariff: number
  withheldAmount: number
  status: string
  counterpartyName: string
  counterpartyTaxId: string | null
  facility: string | null
  typeName: string
}

const columnHelper = createColumnHelper<WithholdingCertificateRow>()

const columns = [
  columnHelper.accessor("certificateNumber", {
    header: "No. Bukti Potong",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
            <Receipt className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>{row.certificateNumber}</span>
          </div>
          <span className="block text-[11px] text-muted-foreground font-mono">
            Masa: {row.taxPeriod} · {row.article}
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("direction", {
    header: "Jenis Pemotongan",
    cell: (info) => {
      const isWeWithhold = info.getValue() === "we_withhold"
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
            isWeWithhold
              ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
          }`}
        >
          <span>{isWeWithhold ? "Dipungut Sendiri (Vendor)" : "Dipotong Pihak Lain"}</span>
        </span>
      )
    },
  }),
  columnHelper.accessor("withholdingDate", {
    header: "Tanggal",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("counterpartyName", {
    header: "Pihak Terkait",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <span className="block text-xs font-medium text-foreground">
            {row.counterpartyName}
          </span>
          <span className="block text-[11px] text-muted-foreground font-mono">
            NPWP: {row.counterpartyTaxId || "-"}
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("dpp", {
    header: "DPP Penghasilan Bruto",
    cell: (info) => (
      <span className="text-right block font-mono text-xs font-medium text-foreground tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("withheldAmount", {
    header: "PPh Dipotong",
    cell: (info) => (
      <div className="text-right">
        <span className="block font-mono text-xs font-semibold text-foreground tabular-nums">
          {formatCurrencyExact(info.getValue())}
        </span>
        <span className="block text-[10px] text-muted-foreground font-mono">
          Tarif {info.row.original.tariff}%
        </span>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      const toneMap: Record<string, "success" | "warning" | "danger" | "default"> = {
        issued: "success",
        draft: "warning",
        revoked: "danger",
      }
      const labelMap: Record<string, string> = {
        issued: "DITERBITKAN",
        draft: "DRAFT",
        revoked: "DICABUT",
      }
      return (
        <div className="flex justify-center">
          <StatusChip
            status={val}
            customLabel={labelMap[val] ?? val.toUpperCase()}
            customTone={toneMap[val] ?? "default"}
          />
        </div>
      )
    },
  }),
]

interface WithholdingCertificateTableProps {
  data: WithholdingCertificateRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function WithholdingCertificateTable({
  data,
  total,
  page,
  pageSize,
  toolbar,
  filters,
}: WithholdingCertificateTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      serverPagination={{
        page,
        pageSize,
        total,
      }}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
