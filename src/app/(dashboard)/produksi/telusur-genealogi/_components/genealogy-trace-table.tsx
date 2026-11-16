"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"

export interface GenealogyTraceRow {
  id: number
  productionOrderId: number
  productionOrderSlug: string | null
  productionOrderDocumentNo: string
  outputItemLabel: string
  outputSerials: string[]
  outputBatch: string | null
  matchedItemLabels: string[]
  matchedTokens: string[]
  completedAt: string
  completedByName: string | null
}

const columnHelper = createColumnHelper<GenealogyTraceRow>()

const columns = [
  columnHelper.accessor("productionOrderDocumentNo", {
    header: "Perintah Produksi",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const hit = info.row.original
      return (
        <Link
          href={entityHref("/produksi/production-orders", {
            id: hit.productionOrderId,
            slug: hit.productionOrderSlug,
          })}
          className="font-mono font-medium text-primary hover:underline"
        >
          {hit.productionOrderDocumentNo}
        </Link>
      )
    },
  }),
  columnHelper.accessor("outputItemLabel", {
    header: "Hasil Jadi",
    cell: (info) => {
      const hit = info.row.original
      return (
        <div>
          <span className="font-medium text-foreground">{hit.outputItemLabel}</span>
          {hit.outputSerials.length ? (
            <span className="block font-mono text-xs text-muted-foreground mt-0.5">
              {hit.outputSerials.join(", ")}
            </span>
          ) : hit.outputBatch ? (
            <span className="block font-mono text-xs text-muted-foreground mt-0.5">
              {hit.outputBatch}
            </span>
          ) : null}
        </div>
      )
    },
  }),
  columnHelper.accessor("matchedItemLabels", {
    header: "Bahan yang Cocok",
    cell: (info) => (
      <span className="text-foreground">{info.getValue().join(", ")}</span>
    ),
  }),
  columnHelper.accessor("matchedTokens", {
    header: "Lot/Serial Cocok",
    cell: (info) => (
      <span className="font-mono text-xs text-foreground">{info.getValue().join(", ")}</span>
    ),
  }),
  columnHelper.accessor("completedAt", {
    header: "Diselesaikan",
    cell: (info) => (
      <span className="tabular-nums text-foreground">{formatDate(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("completedByName", {
    header: "Diselesaikan Oleh",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? "-"}</span>
    ),
  }),
]

export function GenealogyTraceTable({ data }: { data: GenealogyTraceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Hasil Telusur Genealogi Produksi"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
