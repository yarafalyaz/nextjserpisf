"use client"

import { Chip, cn } from "@heroui/react"
import { Pencil } from "lucide-react"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import type { ColumnDef } from "@tanstack/react-table"

interface VehicleRow {
  id: number
  plateNumber?: string | null
  year?: number | null
  color?: string | null
  variant?: {
    id: number
    name: string
    model?: {
      id: number
      name: string
      brand?: { id: number; name: string } | null
    } | null
  } | null
}

export function VehicleTable({ data }: { data: VehicleRow[] }) {
  const columns: ColumnDef<VehicleRow>[] = [
    {
      id: "plateNumber",
      accessorKey: "plateNumber",
      header: "Plat Nomor",
      cell: ({ row }) => (
        <Link href={`/vehicles/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.plateNumber ?? "-"}
        </Link>
      ),
      size: 130,
    },
    {
      id: "brand",
      accessorKey: "variant.model.brand.name",
      header: "Merek",
      cell: ({ row }) => row.original.variant?.model?.brand?.name ?? "-",
      size: 120,
    },
    {
      id: "model",
      accessorKey: "variant.model.name",
      header: "Model",
      cell: ({ row }) => row.original.variant?.model?.name ?? "-",
      size: 130,
    },
    {
      id: "variant",
      accessorKey: "variant.name",
      header: "Varian",
      cell: ({ row }) => row.original.variant?.name ?? "-",
      size: 120,
    },
    {
      id: "year",
      accessorKey: "year",
      header: "Tahun",
      cell: ({ row }) => row.original.year ?? "-",
      size: 80,
    },
    {
      id: "color",
      accessorKey: "color",
      header: "Warna",
      cell: ({ row }) => {
        const c = row.original.color
        return c ? (
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-default shrink-0" style={{ backgroundColor: c }} />
            <span className="text-sm">{c}</span>
          </div>
        ) : <span className="text-muted">-</span>
      },
      size: 110,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/vehicles/${row.original.id}`}
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

  return <DataTable data={data} columns={columns} ariaLabel="Daftar kendaraan" pageSize={20} />
}
