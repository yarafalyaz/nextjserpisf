"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface PurchaseReturnItemRow {
  id: number
  itemId: number
  itemName: string | null
  itemCode: string | null
  qty: number
  unitOfMeasure: string | null
  cost: number
  costFormatted?: string
}

const columnHelper = createColumnHelper<PurchaseReturnItemRow>()

export function PurchaseReturnItemsTable({
  data,
  canViewCosts,
}: Readonly<{ data: PurchaseReturnItemRow[]; canViewCosts: boolean }>) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "item",
        header: "Barang",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const row = info.row.original
          return row.itemName ? (
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{row.itemName}</span>
              {row.itemCode && (
                <span className="text-xs text-muted-foreground font-mono">{row.itemCode}</span>
              )}
            </div>
          ) : (
            `Item #${row.itemId}`
          )
        },
      }),
      columnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor("unitOfMeasure", {
        header: "Satuan",
        cell: (info) => info.getValue() || "-",
      }),
      ...(canViewCosts
        ? [
            columnHelper.accessor("cost", {
              header: "Biaya Satuan",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums">
                  {info.row.original.costFormatted ?? formatCurrencyExact(info.getValue())}
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
      ariaLabel="Item Retur Pembelian"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
