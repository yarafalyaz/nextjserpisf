"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatNumber } from "@/lib/utils/format"

export interface BomRevisionMaterialRow {
  id: number
  itemId: number
  itemSlug: string | null
  itemSku: string | null
  itemName: string | null
  qty: number
  unitOfMeasure: string
}

export interface BomRevisionProductionOrderRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
}

const materialColumnHelper = createColumnHelper<BomRevisionMaterialRow>()

const materialColumns = [
  materialColumnHelper.accessor("itemName", {
    header: "Barang",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      if (!row.itemName) {
        return <span className="text-foreground">Barang #{row.itemId}</span>
      }
      return (
        <Link
          href={entityHref("/master/barang", { id: row.itemId, slug: row.itemSlug })}
          className="hover:underline text-foreground"
        >
          {row.itemSku && (
            <span className="font-mono text-muted-foreground mr-1.5">{row.itemSku}</span>
          )}
          <span className="font-medium">{row.itemName}</span>
        </Link>
      )
    },
  }),
  materialColumnHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => {
      const row = info.row.original
      return (
        <span className="font-mono tabular-nums text-foreground">
          {formatNumber(row.qty)} {row.unitOfMeasure}
        </span>
      )
    },
  }),
]

export function BomRevisionMaterialsTable({ data }: { data: BomRevisionMaterialRow[] }) {
  return (
    <DataTable
      data={data}
      columns={materialColumns}
      ariaLabel="Bahan BOM Revisi"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const poColumnHelper = createColumnHelper<BomRevisionProductionOrderRow>()

const poColumns = [
  poColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/produksi/production-orders", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  poColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function BomRevisionProductionOrdersTable({
  data,
}: {
  data: BomRevisionProductionOrderRow[]
}) {
  return (
    <DataTable
      data={data}
      columns={poColumns}
      ariaLabel="Perintah Produksi yang Memakai Revisi Ini"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
