"use client"

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
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
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"
import { Input } from "@/components/ui/shadcn/input"
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
} from "lucide-react"

interface InvoiceRow {
  id: number
  documentNo: string
  customerName: string
  grandTotal: number
  paidAmount: number
  status: string
  date: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-transparent bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400" },
  posted: { label: "Diterbitkan", className: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  partial: { label: "Sebagian", className: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  paid: { label: "Lunas", className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  cancelled: { label: "Dibatalkan", className: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
}

function formatRp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

function SortButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 px-2 text-xs font-medium"
      onClick={onClick}
    >
      {children}
      <ArrowUpDown className="size-3.5" />
    </Button>
  )
}

const columns: ColumnDef<InvoiceRow>[] = [
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
      <Link href={`/penjualan/faktur/${row.original.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
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
      <span className="block max-w-[180px] truncate font-medium">{row.original.customerName}</span>
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
      <span className="text-xs text-muted-foreground">{formatDate(row.original.date)}</span>
    ),
  },
  {
    accessorKey: "grandTotal",
    header: ({ column }) => (
      <SortButton onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Total
      </SortButton>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{formatRp(row.original.grandTotal)}</span>
    ),
  },
  {
    accessorKey: "paidAmount",
    header: "Terbayar",
    cell: ({ row }) => {
      const paid = row.original.paidAmount
      const total = row.original.grandTotal
      const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

      return (
        <div className="min-w-[150px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{formatRp(paid)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const cfg = statusConfig[row.original.status] ?? { label: row.original.status, className: "" }
      return (
        <Badge variant="outline" className={cfg.className}>
          {cfg.label}
        </Badge>
      )
    },
  },
]

export function RecentInvoicesTable({ data }: { data: InvoiceRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [statusTab, setStatusTab] = useState("all")
  const [query, setQuery] = useState("")

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

  // TanStack Table intentionally returns functions from useReactTable; this
  // matches the established local DataTable lint handling.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
    enableRowSelection: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faktur Terbaru</CardTitle>
        <CardDescription>10 faktur penjualan terakhir</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/penjualan/faktur">
              Semua <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={statusTab} onValueChange={setStatusTab} className="gap-0">
          <div className="flex flex-col gap-3 border-t px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <TabsList variant="line" className="w-full justify-start overflow-x-auto lg:w-auto">
              <TabsTrigger value="all">Semua ({counts.all})</TabsTrigger>
              <TabsTrigger value="unpaid">Terbuka ({counts.unpaid})</TabsTrigger>
              <TabsTrigger value="paid">Lunas ({counts.paid})</TabsTrigger>
              <TabsTrigger value="draft">Draft ({counts.draft})</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative w-full lg:w-[260px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari faktur atau pelanggan"
                  aria-label="Cari faktur atau pelanggan"
                  className="h-8 pl-8"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 shrink-0" aria-label="Pilih kolom tabel">
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
                        {column.id === "documentNo" ? "dokumen" : column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} className="px-4 lg:px-6">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                      Belum ada faktur
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-4 lg:px-6">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
            <span>
              {table.getSelectedRowModel().rows.length} dari {filteredData.length} faktur dipilih
            </span>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span>
                Halaman {table.getState().pagination.pageIndex + 1} dari {Math.max(table.getPageCount(), 1)}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}
