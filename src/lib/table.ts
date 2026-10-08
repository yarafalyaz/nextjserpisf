import {
  createColumnHelper as createTanstackColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  stockFeatures,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table"

export const erpTableFeatures = tableFeatures({
  ...stockFeatures,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
})

export function createColumnHelper<TData extends RowData>() {
  return createTanstackColumnHelper<typeof erpTableFeatures, TData>()
}

export type ErpColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  typeof erpTableFeatures,
  TData,
  TValue
>
