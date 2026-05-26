"use client"

import type { SortDescriptor, Selection } from "@heroui/react"
import type { ColumnDef, SortingState } from "@tanstack/react-table"

import { Table, Checkbox, Pagination, Button, cn } from "@heroui/react"
import { ChevronUp, Trash2 } from "lucide-react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"

// --- Sorting Bridge ---
function toSortDescriptor(sorting: SortingState): SortDescriptor | undefined {
  const first = sorting[0]
  if (!first) return undefined
  return {
    column: first.id,
    direction: first.desc ? "descending" : "ascending",
  }
}

function toSortingState(descriptor: SortDescriptor): SortingState {
  return [{ desc: descriptor.direction === "descending", id: descriptor.column as string }]
}

// --- Sort Header ---
function SortableColumnHeader({
  children,
  sortDirection,
}: {
  children: React.ReactNode
  sortDirection?: "ascending" | "descending"
}) {
  return (
    <span className="flex items-center justify-between">
      {children}
      {!!sortDirection && (
        <ChevronUp
          className={cn(
            "size-3 transform transition-transform duration-100 ease-out",
            sortDirection === "descending" ? "rotate-180" : ""
          )}
        />
      )}
    </span>
  )
}

// --- Types ---
interface DataTableProps<TData> {
  data: TData[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[]
  ariaLabel?: string
  pageSize?: number
  selectable?: boolean
  onSelectionChange?: (selectedIds: Set<string>) => void
  bulkActions?: React.ReactNode
  onBulkDelete?: (ids: number[]) => Promise<{ success: boolean; message?: string }>
}

// --- Component ---
export function DataTable<TData extends { id: number | string }>({
  data,
  columns,
  ariaLabel = "Data table",
  pageSize = 20,
  selectable = true,
  onSelectionChange,
  bulkActions,
  onBulkDelete,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    state: { sorting },
  })

  const sortDescriptor = useMemo(() => toSortDescriptor(sorting), [sorting])

  const { pageIndex } = table.getState().pagination
  const pageCount = table.getPageCount()
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  const totalRows = data.length
  const start = pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, totalRows)

  function handleSelectionChange(keys: Selection) {
    setSelectedKeys(keys)
    if (onSelectionChange) {
      if (keys === "all") {
        onSelectionChange(new Set(data.map((d) => String(d.id))))
      } else {
        onSelectionChange(keys as Set<string>)
      }
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete) return
    const ids = selectedKeys === "all"
      ? data.map((d) => Number(d.id))
      : Array.from(selectedKeys as Set<string>).map(Number)

    if (!ids.length) return
    if (!confirm(`Yakin hapus ${ids.length} data?`)) return

    setIsDeleting(true)
    try {
      const result = await onBulkDelete(ids)
      if (result.success) {
        setSelectedKeys(new Set())
      } else {
        alert(result.message || "Gagal menghapus data")
      }
    } catch {
      alert("Terjadi kesalahan saat menghapus data")
    } finally {
      setIsDeleting(false)
    }
  }

  const selectedCount = selectedKeys === "all" ? totalRows : (selectedKeys as Set<string>).size

  return (
    <Table>
      {selectedCount > 0 && (bulkActions || onBulkDelete) && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b rounded-t-lg">
          <span className="text-sm font-medium">{selectedCount} data dipilih</span>
          {onBulkDelete && (
            <Button size="sm" variant="danger-soft" onPress={handleBulkDelete} isDisabled={isDeleting}>
              <Trash2 className="size-3" /> {isDeleting ? "Menghapus..." : "Hapus Terpilih"}
            </Button>
          )}
          {bulkActions}
        </div>
      )}
      <Table.ScrollContainer>
        <Table.Content
          aria-label={ariaLabel}
          sortDescriptor={sortDescriptor}
          onSortChange={(d) => setSorting(toSortingState(d))}
          {...(selectable && {
            selectedKeys,
            selectionMode: "multiple" as const,
            onSelectionChange: handleSelectionChange,
          })}
        >
          <Table.Header>
            {selectable && (
              <Table.Column className="pr-0 w-10">
                <Checkbox aria-label="Pilih semua" slot="selection">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
              </Table.Column>
            )}
            {table.getHeaderGroups()[0]!.headers.map((header, idx) => (
              <Table.Column
                key={header.id}
                allowsSorting={header.column.getCanSort()}
                id={header.id}
                isRowHeader={idx === 0}
              >
                {({ sortDirection }) => (
                  <SortableColumnHeader sortDirection={sortDirection}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </SortableColumnHeader>
                )}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {table.getRowModel().rows.length === 0 ? (
              <Table.Row>
                <Table.Cell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="text-center py-8 text-muted"
                >
                  Tidak ada data
                </Table.Cell>
              </Table.Row>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Table.Row key={row.original.id} id={row.original.id}>
                  {selectable && (
                    <Table.Cell className="pr-0">
                      <Checkbox
                        aria-label={`Pilih baris ${row.original.id}`}
                        slot="selection"
                        variant="secondary"
                      >
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                    </Table.Cell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <Table.Cell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
      {pageCount > 1 && (
        <Table.Footer>
          <Pagination size="sm">
            <Pagination.Summary>
              {start} - {end} dari {totalRows} data
            </Pagination.Summary>
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous
                  isDisabled={!table.getCanPreviousPage()}
                  onPress={() => table.previousPage()}
                >
                  <Pagination.PreviousIcon />
                  Prev
                </Pagination.Previous>
              </Pagination.Item>
              {pages.map((p) => (
                <Pagination.Item key={p}>
                  <Pagination.Link
                    isActive={p === pageIndex + 1}
                    onPress={() => table.setPageIndex(p - 1)}
                  >
                    {p}
                  </Pagination.Link>
                </Pagination.Item>
              ))}
              <Pagination.Item>
                <Pagination.Next
                  isDisabled={!table.getCanNextPage()}
                  onPress={() => table.nextPage()}
                >
                  Next
                  <Pagination.NextIcon />
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        </Table.Footer>
      )}
    </Table>
  )
}
