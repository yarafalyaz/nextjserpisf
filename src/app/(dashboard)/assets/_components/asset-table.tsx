"use client"

import { Chip, cn } from "@heroui/react"
import { Pencil } from "lucide-react"
import Link from "next/link"
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
        <Link href={`/assets/${row.original.id}`} className="font-medium text-primary hover:underline">
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
            <span className="text-xs text-muted">{row.original.location}</span>
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
          <Chip
            size="sm"
            variant="soft"
            className={cn(
              cond === "good" && "bg-success-soft text-success-soft-foreground",
              cond === "fair" && "bg-warning-soft text-warning-soft-foreground",
              cond === "poor" && "bg-danger-soft text-danger-soft-foreground",
            )}
          >
            {cond === "good" ? "Baik" : cond === "fair" ? "Cukup" : cond === "poor" ? "Rusak" : cond}
          </Chip>
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
          <Chip
            size="sm"
            variant="soft"
            className={cn(
              s === "active" && "bg-success-soft text-success-soft-foreground",
              s === "inactive" && "bg-default-soft text-default-soft-foreground",
              s === "disposed" && "bg-danger-soft text-danger-soft-foreground",
              s === "maintenance" && "bg-warning-soft text-warning-soft-foreground",
            )}
          >
            {s === "active" ? "Aktif" : s === "inactive" ? "Nonaktif" : s === "disposed" ? "Dibuang" : s === "maintenance" ? "Perbaikan" : s}
          </Chip>
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
            href={`/assets/${row.original.id}`}
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-all"
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
      onBulkDelete={(ids) => bulkDelete("asset", ids)}
    />
  )
}
