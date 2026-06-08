"use client"

import type {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from "lucide-react"
import { useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/shadcn/button"
import { Input } from "@/components/ui/shadcn/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError } from "@/lib/utils/toast"

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
  /** Column id to attach the built-in search box to. When set, a filter input is shown in the toolbar. */
  searchColumn?: string
  /** Placeholder for the built-in search box. */
  searchPlaceholder?: string
  /** Show the "Kolom" column-visibility dropdown in the toolbar (default true). */
  enableColumnToggle?: boolean
  /** Extra controls rendered on the left of the toolbar row (e.g. server-side search). */
  toolbar?: React.ReactNode
  /** Filter controls (e.g. status chips) rendered on their own row below the search row. */
  filters?: React.ReactNode
}

/** Resolve a human-friendly label for a column (used in the visibility menu). */
function columnLabel(column: { id: string; columnDef: { header?: unknown } }): string {
  const header = column.columnDef.header
  return typeof header === "string" && header.trim() ? header : column.id
}

export function DataTable<TData extends { id: number | string }>({
  data,
  columns,
  ariaLabel = "Tabel data",
  pageSize = 20,
  selectable = true,
  onSelectionChange,
  bulkActions,
  onBulkDelete,
  searchColumn,
  searchPlaceholder = "Cari...",
  enableColumnToggle = true,
  toolbar,
  filters,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])

  // React Compiler cannot memoize TanStack Table's useReactTable (it returns
  // functions by design); this is a known, expected incompatibility, not a bug.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: selectable,
    getRowId: (row) => String(row.id),
    state: { sorting, rowSelection, columnFilters, columnVisibility },
  })

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(new Set(Object.keys(rowSelection).filter((k) => rowSelection[k])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection])

  const currentPageSize = table.getState().pagination.pageSize
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const filteredRowCount = table.getFilteredRowModel().rows.length
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k])
  const headers = table.getHeaderGroups()[0]?.headers ?? []

  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide())
  const showColumnToggle = enableColumnToggle && hideableColumns.length > 0
  const showSearchRow = Boolean(toolbar) || Boolean(searchColumn) || showColumnToggle
  const showToolbar = showSearchRow || Boolean(filters)

  async function executeBulkDelete() {
    if (!onBulkDelete || !pendingDeleteIds.length) return
    setIsDeleting(true)
    try {
      const result = await onBulkDelete(pendingDeleteIds)
      if (result.success) {
        setRowSelection({})
      } else {
        showError(result.message || "Gagal menghapus data")
      }
    } catch {
      showError("Terjadi kesalahan saat menghapus data")
    } finally {
      setIsDeleting(false)
      setConfirmOpen(false)
    }
  }

  function handleBulkDelete() {
    if (!onBulkDelete) return
    const ids = selectedIds.map(Number)
    if (!ids.length) return
    setPendingDeleteIds(ids)
    setConfirmOpen(true)
  }

  return (
    <>
      <div>
        {/* Toolbar: row 1 = search + column visibility; row 2 = filters */}
        {showToolbar && (
          <div className="flex flex-col gap-3 py-4">
            {showSearchRow && (
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                {searchColumn && (
                  <div className="relative min-w-0 flex-1 max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
                      onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="pl-9"
                      aria-label={searchPlaceholder}
                    />
                  </div>
                )}
                {showColumnToggle && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="ml-auto shrink-0">
                        Kolom <ChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {hideableColumns.map((column) => (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) => column.toggleVisibility(!!value)}
                        >
                          {columnLabel(column)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
            {filters && <div className="flex flex-wrap items-center gap-1.5">{filters}</div>}
          </div>
        )}

        {/* Bulk action bar (shown when rows are selected) */}
        {selectedCount > 0 && (bulkActions || onBulkDelete) && (
          <div className="mb-2 flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{selectedCount} data dipilih</span>
            {onBulkDelete && (
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
                <Trash2 className="size-3" /> {isDeleting ? "Menghapus..." : "Hapus Terpilih"}
              </Button>
            )}
            {bulkActions}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-md border">
          <div className="overflow-x-auto">
            <Table aria-label={ariaLabel}>
              <TableHeader>
                <TableRow>
                  {selectable && (
                    <TableHead className="w-10 pr-0">
                      <Checkbox
                        aria-label="Pilih semua"
                        checked={
                          table.getIsAllPageRowsSelected() ||
                          (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
                      />
                    </TableHead>
                  )}
                  {headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : canSort ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-3 h-8 data-[state=open]:bg-accent"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ChevronUp className="size-4" />
                            ) : sorted === "desc" ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ArrowUpDown className="size-4 opacity-50" />
                            )}
                          </Button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Tidak ada data
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                      {selectable && (
                        <TableCell className="pr-0">
                          <Checkbox
                            aria-label={`Pilih baris ${row.original.id}`}
                            checked={row.getIsSelected()}
                            onCheckedChange={(v) => row.toggleSelected(!!v)}
                          />
                        </TableCell>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination (shadcn DataTablePagination layout) */}
        <div className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="text-sm text-muted-foreground sm:flex-1">
            {selectable
              ? `${selectedCount} dari ${filteredRowCount} baris dipilih.`
              : `${filteredRowCount} baris.`}
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:w-auto sm:justify-end lg:gap-8">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium whitespace-nowrap">Baris per halaman</p>
              <Select
                value={String(currentPageSize)}
                onValueChange={(v) => table.setPageSize(Number(v) || 20)}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-center whitespace-nowrap text-sm font-medium">
              Halaman {pageCount === 0 ? 0 : pageIndex + 1} dari {pageCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Ke halaman pertama</span>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Halaman sebelumnya</span>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Halaman berikutnya</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(pageCount - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Ke halaman terakhir</span>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus data terpilih?"
        body={`${pendingDeleteIds.length} data yang dipilih akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        isPending={isDeleting}
        onConfirm={executeBulkDelete}
      />
    </>
  )
}
