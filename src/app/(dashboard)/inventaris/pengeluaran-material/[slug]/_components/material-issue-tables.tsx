"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatCurrencyExact, formatNumber } from "@/lib/utils/format"

export interface MaterialIssueItemRow {
  id: number
  itemName: string
  qty: number
  cost: number
  costFormatted?: string
}

const columnHelper = createColumnHelper<MaterialIssueItemRow>()

export function MaterialIssueItemsTable({
  data,
  canViewCosts,
}: {
  data: MaterialIssueItemRow[]
  canViewCosts: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("itemName", {
        header: "Nama Barang",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
      }),
      columnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(info.getValue())}
          </span>
        ),
      }),
      ...(canViewCosts
        ? [
            columnHelper.accessor("cost", {
              header: "Biaya",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums text-foreground">
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
      ariaLabel="Daftar Barang Pengeluaran Material"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
