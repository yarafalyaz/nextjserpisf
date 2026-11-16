"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatNumber } from "@/lib/utils/format"
import { ConsumeRemnantForm, ScrapRemnantForm } from "./remnant-forms"

export interface RemnantRow {
  id: number
  documentNo: string
  itemSku: string | null
  itemName: string
  qty: number
  uom: string | null
  dimensions: string | null
  measuredSize: number | null
  sourceType: string | null
  sourceId: number | null
  scrapWeightKg: number | null
  status: string
}

const columnHelper = createColumnHelper<RemnantRow>()

function formatSource(sourceType: string | null, sourceId: number | null): string {
  if (!sourceType) return "-"
  const label =
    sourceType === "material_issue_item"
      ? "Baris Material Issue"
      : sourceType === "production_order_material"
        ? "Baris Material Perintah Produksi"
        : sourceType
  return `${label}${sourceId != null ? ` #${sourceId}` : ""}`
}

export function RemnantTable({
  data,
  canCreate,
}: {
  data: RemnantRow[]
  canCreate: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("documentNo", {
        header: "Dokumen",
        cell: (info) => (
          <span className="font-mono font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("itemName", {
        header: "Item",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const row = info.row.original
          return (
            <div>
              <div className="font-medium text-foreground">{row.itemName}</div>
              {row.itemSku && (
                <div className="font-mono text-xs text-muted-foreground mt-0.5">{row.itemSku}</div>
              )}
            </div>
          )
        },
      }),
      columnHelper.accessor("qty", {
        header: "Qty",
        meta: { align: "right" },
        cell: (info) => {
          const row = info.row.original
          return (
            <span className="font-mono tabular-nums text-foreground">
              {formatNumber(row.qty)} {row.uom ?? ""}
            </span>
          )
        },
      }),
      columnHelper.accessor("dimensions", {
        header: "Dimensi",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? "-"}</span>
        ),
      }),
      columnHelper.accessor("measuredSize", {
        header: "Ukuran Terukur",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {info.getValue() != null ? formatNumber(info.getValue()!) : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("sourceType", {
        header: "Sumber Baris Issue",
        cell: (info) => {
          const row = info.row.original
          return (
            <span className="text-muted-foreground">
              {formatSource(row.sourceType, row.sourceId)}
            </span>
          )
        },
      }),
      columnHelper.accessor("scrapWeightKg", {
        header: "Besi Tua (kg)",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {info.getValue() != null ? formatNumber(info.getValue()!) : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusChip status={info.getValue()} />,
      }),
      ...(canCreate
        ? [
            columnHelper.display({
              id: "actions",
              header: "Aksi",
              meta: { align: "right" },
              cell: (info) => {
                const row = info.row.original
                if (row.status !== "usable") return null
                return (
                  <div className="flex justify-end gap-2">
                    <ConsumeRemnantForm id={row.id} canCreate={canCreate} />
                    <ScrapRemnantForm id={row.id} canCreate={canCreate} />
                  </div>
                )
              },
            }),
          ]
        : []),
    ],
    [canCreate],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar Sisa Material"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
