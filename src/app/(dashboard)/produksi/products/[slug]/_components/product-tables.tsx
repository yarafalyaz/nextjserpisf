"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"

export interface ProductMaterialRow {
  id: number
  itemId: number
  itemSlug: string | null
  itemSku: string | null
  itemName: string | null
  qty: number
  unitOfMeasure: string
}

export interface ProductBomRevisionRow {
  id: number
  slug: string | null
  revisionNo: number
  status: string
  effectiveDate: string
}

export interface ProductProductionOrderRow {
  id: number
  slug: string | null
  documentNo: string
  qty: number
  status: string
}

const materialColumnHelper = createColumnHelper<ProductMaterialRow>()

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

export function ProductMaterialsTable({ data }: { data: ProductMaterialRow[] }) {
  return (
    <DataTable
      data={data}
      columns={materialColumns}
      ariaLabel="Rincian Bahan Baku BOM"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const revisionColumnHelper = createColumnHelper<ProductBomRevisionRow>()

const revisionColumns = [
  revisionColumnHelper.accessor("revisionNo", {
    header: "Revisi",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/produksi/bom-revisi", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          Rev {row.revisionNo}
        </Link>
      )
    },
  }),
  revisionColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  revisionColumnHelper.accessor("effectiveDate", {
    header: "Berlaku",
    cell: (info) => (
      <span className="tabular-nums text-foreground">{formatDate(info.getValue())}</span>
    ),
  }),
]

export function ProductBomRevisionsTable({ data }: { data: ProductBomRevisionRow[] }) {
  return (
    <DataTable
      data={data}
      columns={revisionColumns}
      ariaLabel="Daftar Revisi BOM Produk"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const poColumnHelper = createColumnHelper<ProductProductionOrderRow>()

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
  poColumnHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  poColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function ProductProductionOrdersTable({ data }: { data: ProductProductionOrderRow[] }) {
  return (
    <DataTable
      data={data}
      columns={poColumns}
      ariaLabel="Perintah Produksi Terbaru"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
