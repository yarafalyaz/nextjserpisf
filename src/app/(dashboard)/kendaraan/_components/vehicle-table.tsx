"use client"

import { Pencil } from "lucide-react"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { bulkDelete } from "@/actions/bulk.actions"
import type { ErpColumnDef as ColumnDef } from "@/lib/table"

interface VehicleRow {
  id: number
  name?: string | null
  year?: number | null
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

export function VehicleTable({ data, total, page, pageSize }: { data: VehicleRow[]; total: number; page: number; pageSize: number }) {
  const columns: ColumnDef<VehicleRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Tipe Kendaraan",
      cell: ({ row }) => (
        <Link href={`/kendaraan/${row.original.id}`} className="font-medium text-foreground hover:underline">
          {row.original.name ?? row.original.variant?.name ?? "-"}
        </Link>
      ),
      size: 180,
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
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/kendaraan/${row.original.id}`}
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
        ariaLabel="Daftar kendaraan"
        serverPagination={{ total, page, pageSize }}
        selectable={true}
        searchColumn="name"
        searchPlaceholder="Cari nama tipe, merek, model, atau varian..."
        onBulkDelete={(ids) => bulkDelete("vehicle", ids)}
      />
  )
}
