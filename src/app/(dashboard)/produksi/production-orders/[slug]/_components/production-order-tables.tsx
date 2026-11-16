"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact, formatNumber } from "@/lib/utils/format"

export interface ProductionOrderMaterialRow {
  id: number
  itemName: string
  qty: number
  actualQty: number
  standardCost: number
  actualCost: number
}

export interface ProductionOrderGenealogyMaterialRow {
  id: number
  itemSku: string | null
  itemName: string
  qty: number
  tokens: string[]
  unitCost: number
  totalCost: number
}

const materialColumnHelper = createColumnHelper<ProductionOrderMaterialRow>()

const materialColumns = [
  materialColumnHelper.accessor("itemName", {
    header: "Barang",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  materialColumnHelper.accessor("qty", {
    header: "Kuantitas Rencana",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  materialColumnHelper.accessor("actualQty", {
    header: "Kuantitas Aktual",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  materialColumnHelper.accessor("standardCost", {
    header: "Biaya Standar",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  materialColumnHelper.accessor("actualCost", {
    header: "Biaya Aktual",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
]

export function ProductionOrderMaterialsTable({ data }: { data: ProductionOrderMaterialRow[] }) {
  return (
    <DataTable
      data={data}
      columns={materialColumns}
      ariaLabel="Bahan yang Dibutuhkan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const genealogyColumnHelper = createColumnHelper<ProductionOrderGenealogyMaterialRow>()

export function ProductionOrderGenealogyTable({
  data,
  canViewCosts,
}: {
  data: ProductionOrderGenealogyMaterialRow[]
  canViewCosts: boolean
}) {
  const columns = useMemo(
    () => [
      genealogyColumnHelper.accessor("itemName", {
        header: "Barang",
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
      genealogyColumnHelper.accessor("qty", {
        header: "Kuantitas",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(info.getValue())}
          </span>
        ),
      }),
      genealogyColumnHelper.accessor("tokens", {
        header: "Lot/Nomor Seri",
        cell: (info) => {
          const tokens = info.getValue()
          if (!tokens.length) return <span className="text-muted-foreground">-</span>
          return (
            <span className="font-mono text-xs">
              {tokens.map((token, i) => (
                <span key={token}>
                  {i > 0 ? ", " : null}
                  <Link
                    href={`/produksi/telusur-genealogi?cari=${encodeURIComponent(token)}`}
                    className="text-primary hover:underline"
                    title="Telusur hasil jadi yang memakai lot/serial ini"
                  >
                    {token}
                  </Link>
                </span>
              ))}
            </span>
          )
        },
      }),
      ...(canViewCosts
        ? [
            genealogyColumnHelper.accessor("unitCost", {
              header: "Biaya Satuan",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums text-foreground">
                  {formatCurrencyExact(info.getValue())}
                </span>
              ),
            }),
            genealogyColumnHelper.accessor("totalCost", {
              header: "Total",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums text-foreground">
                  {formatCurrencyExact(info.getValue())}
                </span>
              ),
            }),
          ]
        : []),
    ],
    [canViewCosts],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Bahan yang Dipakai dalam Genealogi"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
