"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"

export interface DeliveryOrderItemRow {
  id: number
  itemName: string
  sku: string
  qty: number
  unitOfMeasure: string
}

const columnHelper = createColumnHelper<DeliveryOrderItemRow>()

const columns = [
  columnHelper.accessor("itemName", {
    header: "Barang",
    meta: { mobilePrimary: true },
  }),
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("qty", {
    header: "Jumlah",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("unitOfMeasure", {
    header: "Satuan",
  }),
]

export function DeliveryOrderItemsTable({
  data,
}: Readonly<{ data: DeliveryOrderItemRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Barang Dikirim"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
