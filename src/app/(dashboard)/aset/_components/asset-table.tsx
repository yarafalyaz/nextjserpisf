"use client"

import { Pencil } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency } from "@/lib/utils/format"
import { DataTable } from "@/components/ui/data-table"
import { bulkDelete } from "@/actions/bulk.actions"
import type { ColumnDef } from "@tanstack/react-table"

interface AssetRow {
  id: number
  code: string
  name: string
  category?: { id: number; name: string } | null
  purchaseCost: number
  currentValue: number
  status: string
  condition: string
  location?: string | null
}

export function AssetTable({
  data,
}: {
  data: AssetRow[]
}) {
  const columns: ColumnDef<AssetRow>[] = [
    {
      id: "code",
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Link href={`/aset/${row.original.id}`} className="font-medium text-foreground hover:underline">
          {row.original.code}
        </Link>
      ),
      size: 120,
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Nama Aset",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          {row.original.location && (
            <span className="text-xs text-muted-foreground">{row.original.location}</span>
          )}
        </div>
      ),
    },
    {
      id: "category",
      accessorKey: "category.name",
      header: "Kategori",
      cell: ({ row }) => row.original.category?.name ?? "-",
      size: 140,
    },
    {
      id: "purchaseCost",
      accessorKey: "purchaseCost",
      header: "Harga Beli",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatCurrency(row.original.purchaseCost)}</span>
      ),
      size: 150,
    },
    {
      id: "currentValue",
      accessorKey: "currentValue",
      header: "Nilai Saat Ini",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatCurrency(row.original.currentValue)}</span>
      ),
      size: 150,
    },
    {
      id: "condition",
      accessorKey: "condition",
      header: "Kondisi",
      cell: ({ row }) => {
        const cond = row.original.condition
        return (
          <Badge
            variant="outline"
            className={cn(
              "font-medium border-transparent",
              cond === "good" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
              cond === "fair" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
              cond === "poor" && "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
            )}
          >
            {cond === "good" ? "Baik" : cond === "fair" ? "Cukup" : cond === "poor" ? "Rusak" : cond}
          </Badge>
        )
      },
      size: 100,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status
        return (
          <Badge
            variant="outline"
            className={cn(
              "font-medium border-transparent",
              s === "active" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
              s === "inactive" && "bg-muted text-muted-foreground",
              s === "disposed" && "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
              s === "maintenance" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
            )}
          >
            {s === "active" ? "Aktif" : s === "inactive" ? "Nonaktif" : s === "disposed" ? "Dibuang" : s === "maintenance" ? "Perbaikan" : s}
          </Badge>
        )
      },
      size: 110,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/aset/${row.original.id}`}
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-all"
            aria-label="Detail"
          >
            <Pencil size={15} />
          </Link>
        </div>
      ),
      size: 60,
      enableSorting: false,
    },
  ]

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar aset"
      pageSize={20}
      selectable={true}
      searchColumn="code"
      searchPlaceholder="Cari nama, kode, atau lokasi..."
      onBulkDelete={(ids) => bulkDelete("asset", ids)}
    />
  )
}
