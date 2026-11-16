"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface SalesReturnItemRow {
  id: number
  itemName: string
  sku: string
  qty: number
  cost: number
  costFormatted?: string
}

const columnHelper = createColumnHelper<SalesReturnItemRow>()

export function SalesReturnItemsTable({
  data,
  canViewCosts,
}: Readonly<{ data: SalesReturnItemRow[]; canViewCosts: boolean }>) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("itemName", {
        header: "Barang",
        meta: { mobilePrimary: true },
      }),
      columnHelper.accessor("sku", {
        header: "SKU",
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
      }),
      columnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
      }),
      ...(canViewCosts
        ? [
            columnHelper.accessor("cost", {
              header: "Biaya",
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
      ariaLabel="Barang Retur"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
