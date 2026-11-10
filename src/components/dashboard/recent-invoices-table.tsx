"use client"

import { flexRender, useTable } from "@tanstack/react-table"
import type {
  RowSelectionState,
  SortingState,
  ColumnVisibilityState,
} from "@tanstack/react-table"
import type { ErpColumnDef } from "@/lib/table"
import { erpTableFeatures } from "@/lib/table"
import type { ReactNode } from "react"
import { useId, useMemo, useState } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/shadcn/card"
import { Button } from "@/components/ui/shadcn/button"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Input } from "@/components/ui/shadcn/input"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs"
import {
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "@/components/ui/fontawesome-icons"

interface InvoiceRow {
  id: number
  slug?: string | null
  documentNo: string
  customerName: string
  grandTotal: number
  paidAmount: number
  status: string
  date: string
}

function formatRp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  })
}

function SortButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  const label = typeof children === "string" ? children : "kolom"
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2.5 h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={`Urutkan ${label}`}
    >
      {children}
      <ArrowUpDown className="size-3" aria-hidden="true" />
    </Button>
  )
}

const INVOICE_TABLE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  posted: "Menunggu Pembayaran",
  partial: "Sebagian",
  paid: "Lunas",
  cancelled: "Dibatalkan",
}

const columns: ErpColumnDef<InvoiceRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Pilih semua faktur"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Pilih faktur ${row.original.documentNo}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: "documentNo",
    header: ({ column }) => (
      <SortButton onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        No. Dokumen
      </SortButton>
    ),
    cell: ({ row }) => (
      <Link
        href={entityHref("/penjualan/faktur", row.original)}
        className="font-mono text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {row.original.documentNo}
      </Link>
    ),
  },
  {
    accessorKey: "customerName",
    header: ({ column }) => (
      <SortButton onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Pelanggan
      </SortButton>
    ),
    cell: ({ row }) => (
      <span className="block max-w-[200px] truncate text-[13px] font-medium text-foreground" title={row.original.customerName}>
        {row.original.customerName}
      </span>
    ),
  },
  {
    accessorKey: "date",
    header: ({ column }) => (
      <SortButton onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Tanggal
      </SortButton>
    ),
    cell: ({ row }) => (
      <time className="text-xs tabular-nums text-muted-foreground" dateTime={row.original.date}>
        {formatDate(row.original.date)}
      </time>
    ),
  },
  {
    accessorKey: "grandTotal",
    header: ({ column }) => (
      <div className="flex justify-end">
        <SortButton onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Total
        </SortButton>
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono text-xs font-medium tabular-nums text-foreground">
        {formatRp(row.original.grandTotal)}
      </div>
    ),
  },
  {
    accessorKey: "paidAmount",
    header: "Terbayar",
    cell: ({ row }) => {
      const paid = row.original.paidAmount
      const total = row.original.grandTotal
      const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
      const paidLabel = `Terbayar ${formatRp(paid)} dari ${formatRp(total)}, ${percent} persen`

      return (
        <div className="min-w-[140px]">
          <div className="flex items-center justify-between gap-2" aria-hidden="true">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatRp(paid)}</span>
            <span className="font-mono text-[11px] font-medium tabular-nums text-foreground">{percent}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={paidLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} persen terbayar`}
          >
            <div
              className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${percent}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusChip
        status={row.original.status}
        customLabel={INVOICE_TABLE_STATUS_LABELS[row.original.status]}
      />
    ),
  },
]

export function RecentInvoicesTable({ data }: { data: InvoiceRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [statusTab, setStatusTab] = useState("all")
  const [query, setQuery] = useState("")
  const titleId = useId()
  const paginationId = useId()

  const filteredData = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return data.filter((invoice) => {
      const matchesStatus =
        statusTab === "all" ||
        (statusTab === "unpaid" && ["posted", "partial"].includes(invoice.status)) ||
        (statusTab === "paid" && invoice.status === "paid") ||
        (statusTab === "draft" && invoice.status === "draft")

      const matchesQuery =
        normalized.length === 0 ||
        invoice.documentNo.toLowerCase().includes(normalized) ||
        invoice.customerName.toLowerCase().includes(normalized)

      return matchesStatus && matchesQuery
    })
  }, [data, query, statusTab])

  const counts = useMemo(
    () => ({
      all: data.length,
      unpaid: data.filter((invoice) => ["posted", "partial"].includes(invoice.status)).length,
      paid: data.filter((invoice) => invoice.status === "paid").length,
      draft: data.filter((invoice) => invoice.status === "draft").length,
    }),
    [data]
  )

  const table = useTable({
    features: erpTableFeatures,
    data: filteredData,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: { pagination: { pageIndex: 0, pageSize: 8 } },
    enableRowSelection: true,
  })

  return (
    <Card aria-labelledby={titleId} className="gap-0 py-0">
      <CardHeader className="py-4">
        <CardTitle id={titleId}>Faktur Terbaru</CardTitle>
        <CardDescription>10 faktur penjualan terakhir beserta progres pelunasan</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href="/penjualan/faktur">
              Semua Faktur <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={statusTab} onValueChange={setStatusTab} className="gap-0">
          <div className="flex flex-col gap-3 border-t px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
            <TabsList variant="line" className="w-full justify-start overflow-x-auto lg:w-auto">
              <TabsTrigger value="all">Semua ({counts.all})</TabsTrigger>
              <TabsTrigger value="unpaid">Menunggu Pembayaran ({counts.unpaid})</TabsTrigger>
              <TabsTrigger value="paid">Lunas ({counts.paid})</TabsTrigger>
              <TabsTrigger value="draft">Draft ({counts.draft})</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-[260px] lg:w-[260px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari faktur atau pelanggan"
                  aria-label="Cari faktur atau pelanggan"
                  className="pl-8"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-11 shrink-0" aria-label="Pilih kolom tabel">
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                    Kolom
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {column.id === "documentNo"
                          ? "No. Dokumen"
                          : column.id === "customerName"
                          ? "Pelanggan"
                          : column.id === "date"
                          ? "Tanggal"
                          : column.id === "grandTotal"
                          ? "Total"
                          : column.id === "paidAmount"
                          ? "Terbayar"
                          : column.id === "status"
                          ? "Status"
                          : column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile adaptive cards (<768px) */}
          <div className="border-t md:hidden">
            {table.getRowModel().rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground" role="status">
                Belum ada faktur
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {table.getRowModel().rows.map((row) => {
                  const inv = row.original
                  const percent = inv.grandTotal > 0 ? Math.min(100, Math.round((inv.paidAmount / inv.grandTotal) * 100)) : 0
                  const selected = row.getIsSelected()
                  return (
                    <li
                      key={row.id}
                      data-state={selected ? "selected" : undefined}
                      className={`flex flex-col gap-2.5 px-4 py-3.5 transition-colors ${selected ? "bg-muted/35" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="-m-3.5 shrink-0 p-3.5">
                            <Checkbox
                              aria-label={`Pilih faktur ${inv.documentNo}`}
                              checked={selected}
                              onCheckedChange={(value) => row.toggleSelected(!!value)}
                            />
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={entityHref("/penjualan/faktur", inv)}
                              className="font-mono text-xs font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                              {inv.documentNo}
                            </Link>
                            <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">
                              {inv.customerName}
                            </p>
                          </div>
                        </div>
                        <StatusChip
                          status={inv.status}
                          customLabel={INVOICE_TABLE_STATUS_LABELS[inv.status]}
                        />
                      </div>

                      <div className="flex items-baseline justify-between gap-2 pt-0.5">
                        <time className="text-xs tabular-nums text-muted-foreground" dateTime={inv.date}>
                          {formatDate(inv.date)}
                        </time>
                        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatRp(inv.grandTotal)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary"}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                          {percent}% lunas
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="hidden overflow-x-auto border-t md:block">
            <Table aria-label="Tabel faktur terbaru">
              <caption className="sr-only">Daftar faktur penjualan terbaru dengan nomor, pelanggan, tanggal, total, status pembayaran, dan status dokumen</caption>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => {
                      const sort = header.column.getIsSorted()
                      const ariaSort: "ascending" | "descending" | undefined =
                        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined
                      const isSortable = header.column.getCanSort()
                      return (
                        <TableHead
                          key={header.id}
                          scope="col"
                          aria-sort={isSortable ? ariaSort : undefined}
                          className="px-4 lg:px-5"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="py-10 text-center text-muted-foreground"
                      role="status"
                    >
                      Belum ada faktur
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-4 lg:px-5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-5">
            <span aria-live="polite" aria-atomic="true" className="tabular-nums">
              {table.getSelectedRowModel().rows.length} dari {filteredData.length} faktur dipilih
            </span>
            <nav
              id={paginationId}
              aria-label="Navigasi halaman tabel faktur"
              className="flex items-center justify-between gap-3 sm:justify-end"
            >
              <span aria-live="polite" aria-atomic="true" className="tabular-nums">
                Halaman {table.state.pagination.pageIndex + 1} dari {Math.max(table.getPageCount(), 1)}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}
