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
import { useEffect, useMemo, useRef, useState } from "react"
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
import { useIsMobile } from "@/hooks/use-mobile"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { buildSearchParamsString, buildServerSearchUrl } from "@/components/ui/data-table-utils"

/** Heuristic: is this an actions/buttons column (kept visible on mobile)? */
function isActionsColumn(id: string): boolean {
  return /aksi|action|opsi|menu/i.test(id)
}

/** Server-side pagination state (1-based). */
export interface ServerPagination {
  /** Current 1-based page number. */
  page: number
  /** Number of rows per page. */
  pageSize: number
  /** Total number of rows matching the query. */
  total: number
}

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
  /**
   * URL query param the search box writes to when `serverPagination` is set
   * (default "cari"). In server mode the search MUST drive the server query
   * via the URL — a client-side column filter would only ever match the rows
   * already on screen (the current page), silently ignoring every other
   * server page. Ignored in client-paginated mode (the TanStack column filter
   * is used instead). The owning page is responsible for reading this param
   * and filtering its query accordingly.
   */
  searchParam?: string
  /** Show the "Kolom" column-visibility dropdown in the toolbar (default true). */
  enableColumnToggle?: boolean
  /** Extra controls rendered on the left of the toolbar row (e.g. server-side search). */
  toolbar?: React.ReactNode
  /** Filter controls (e.g. status chips) rendered on their own row below the search row. */
  filters?: React.ReactNode
  /** Max number of columns to show on mobile (<768px). Default 3. The actions
   *  column is always kept; the leading columns fill the rest. Set per-column
   *  meta.mobile=true to force-show or meta.mobile=false to force-hide. */
  mobileColumns?: number
  /** When provided, the table uses URL-based pagination (?halaman=N) instead of client-side. */
  serverPagination?: ServerPagination
}

/** Resolve a human-friendly label for a column (used in the visibility menu). */
function columnLabel(column: { id: string; columnDef: { header?: unknown } }): string {
  const header = column.columnDef.header
  return typeof header === "string" && header.trim() ? header : column.id
}

/** Allowed page-size options (always shown in the page-size selector). */
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100]

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
  searchParam = "cari",
  enableColumnToggle = true,
  toolbar,
  filters,
  mobileColumns = 3,
  serverPagination,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])

  // Server-side pagination helpers
  const isServer = Boolean(serverPagination)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Sync server search term from URL query parameter
  const initialSearch = isServer ? searchParams.get(searchParam) ?? "" : ""
  const [serverSearch, setServerSearch] = useState(initialSearch)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync local input value when URL changes (e.g. forward/backward navigation)
  useEffect(() => {
    if (isServer) {
      setServerSearch(searchParams.get(searchParam) ?? "")
    }
  }, [isServer, searchParams, searchParam])

  // Cancel any pending debounced push on unmount so a late timer can't
  // call router.push after the component is gone.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function navigateWithParams(params: Record<string, string | number | undefined>) {
    const qs = buildSearchParamsString(searchParams, params)
    router.push(`${pathname}${qs ? `?${qs}` : ""}`)
  }

  /** Navigate to a specific 1-based page number. */
  function goToPage(newPage: number) {
    navigateWithParams({ halaman: newPage > 1 ? newPage : undefined })
  }

  /** Change page size (resets to page 1). */
  function goToPageSize(newSize: number) {
    navigateWithParams({ pageSize: newSize, halaman: undefined })
  }

  const serverPageCount = useMemo(
    () => (isServer ? Math.max(1, Math.ceil((serverPagination!.total || 0) / serverPagination!.pageSize)) : 1),
    [isServer, serverPagination],
  )

  // Compute effective pagination state
  const effectivePagination = useMemo(() => {
    if (isServer) {
      return { pageIndex: (serverPagination!.page - 1), pageSize: serverPagination!.pageSize }
    }
    return { pageIndex: 0, pageSize }
  }, [isServer, serverPagination, pageSize])

  // React Compiler cannot memoize TanStack Table's useReactTable (it returns
  // functions by design); this is a known, expected incompatibility, not a bug.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: isServer ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    pageCount: isServer ? serverPageCount : undefined,
    manualPagination: isServer,
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: selectable,
    getRowId: (row) => String(row.id),
    state: {
      sorting,
      rowSelection,
      columnFilters,
      columnVisibility,
      ...(isServer ? { pagination: effectivePagination } : {}),
    },
  })

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(new Set(Object.keys(rowSelection).filter((k) => rowSelection[k])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection])

  // Mobile: collapse to the most important columns. Actions column always kept;
  // leading columns fill up to `mobileColumns`. Per-column meta.mobile overrides.
  const isMobile = useIsMobile()
  useEffect(() => {
    if (isMobile) {
      const leaf = table.getAllLeafColumns()
      const vis: VisibilityState = {}
      let budget = Math.max(1, mobileColumns)
      const hasActions = leaf.some((c) => isActionsColumn(c.id))
      if (hasActions) budget -= 1 // reserve a slot for the actions column
      let shown = 0
      for (const col of leaf) {
        const meta = col.columnDef.meta as { mobile?: boolean } | undefined
        if (isActionsColumn(col.id)) { vis[col.id] = true; continue }
        if (meta?.mobile === true) { vis[col.id] = true; continue }
        if (meta?.mobile === false) { vis[col.id] = false; continue }
        if (shown < budget) { vis[col.id] = true; shown++ }
        else { vis[col.id] = false }
      }
      setColumnVisibility(vis)
    } else {
      setColumnVisibility({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mobileColumns])

  // --- Pagination display values ---
  const currentPageSize = isServer ? serverPagination!.pageSize : table.getState().pagination.pageSize
  const pageIndex = isServer ? serverPagination!.page - 1 : table.getState().pagination.pageIndex
  const pageCount = isServer ? serverPageCount : table.getPageCount()
  const totalRows = isServer ? serverPagination!.total : table.getFilteredRowModel().rows.length
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

  /** Handler for server-side page change. */
  function handleServerPreviousPage() {
    if (pageIndex > 0) goToPage(pageIndex) // pageIndex is 0-based; goToPage is 1-based
  }
  function handleServerNextPage() {
    if (pageIndex < pageCount - 1) goToPage(pageIndex + 2)
  }
  function handleServerFirstPage() {
    goToPage(1)
  }
  function handleServerLastPage() {
    goToPage(pageCount)
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
                      value={isServer ? serverSearch : ((table.getColumn(searchColumn)?.getFilterValue() as string) ?? "")}
                      onChange={(e) => {
                        const val = e.target.value
                        if (isServer) {
                          setServerSearch(val)
                          if (debounceRef.current) clearTimeout(debounceRef.current)
                          debounceRef.current = setTimeout(() => {
                            const qs = buildServerSearchUrl(searchParams, searchParam, val)
                            router.push(`${pathname}${qs ? `?${qs}` : ""}`)
                          }, 400)
                        } else {
                          table.getColumn(searchColumn)?.setFilterValue(val)
                        }
                      }}
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
                    const ariaSort = canSort
                      ? sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                    return (
                      <TableHead key={header.id} aria-sort={ariaSort}>
                        {header.isPlaceholder ? null : canSort ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-3 h-8 data-[state=open]:bg-accent"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ChevronUp className="size-4" aria-hidden="true" />
                            ) : sorted === "desc" ? (
                              <ChevronDown className="size-4" aria-hidden="true" />
                            ) : (
                              <ArrowUpDown className="size-4 opacity-50" aria-hidden="true" />
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
              ? `${selectedCount} dari ${totalRows} baris dipilih.`
              : `${totalRows} baris.`}
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:w-auto sm:justify-end lg:gap-8">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium whitespace-nowrap">Baris per halaman</p>
              <Select
                value={String(currentPageSize)}
                onValueChange={(v) =>
                  isServer ? goToPageSize(Number(v) || 100) : table.setPageSize(Number(v) || 20)
                }
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {PAGE_SIZE_OPTIONS.map((n) => (
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
                onClick={isServer ? handleServerFirstPage : () => table.setPageIndex(0)}
                disabled={pageIndex <= 0}
              >
                <span className="sr-only">Ke halaman pertama</span>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={isServer ? handleServerPreviousPage : () => table.previousPage()}
                disabled={pageIndex <= 0}
              >
                <span className="sr-only">Halaman sebelumnya</span>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={isServer ? handleServerNextPage : () => table.nextPage()}
                disabled={pageIndex >= pageCount - 1}
              >
                <span className="sr-only">Halaman berikutnya</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden size-8 lg:flex"
                onClick={isServer ? handleServerLastPage : () => table.setPageIndex(pageCount - 1)}
                disabled={pageIndex >= pageCount - 1}
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
