"use client"

import Link from "next/link"
import { Eye } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import type { ErpColumnDef as ColumnDef } from "@/lib/table"

interface CustomerVehicleRow {
  id: number
  customerId: number
  isActive: boolean
  vehicleType?: string | null
  chassisNumber?: string | null
  engineNumber?: string | null
  customer: { id: number; name: string }
  vehicle?: {
    plateNumber?: string | null
    year?: number | null
    color?: string | null
    variant?: {
      name: string
      model?: {
        name: string
        brand?: { name: string } | null
      } | null
    } | null
  } | null
}

export function CustomerVehicleTable({
  data,
  total,
  page,
  pageSize,
}: {
  data: CustomerVehicleRow[]
  total: number
  page: number
  pageSize: number
}) {
  const columns: ColumnDef<CustomerVehicleRow>[] = [
    {
      id: "plateNumber",
      header: "Plat Nomor",
      cell: ({ row }) => (
        <Link
          href={`/master/pelanggan/${row.original.customerId}/kendaraan/${row.original.id}`}
          className="font-medium font-mono text-foreground hover:underline"
        >
          {row.original.vehicle?.plateNumber ?? "-"}
        </Link>
      ),
      size: 130,
    },
    {
      id: "customer",
      header: "Pelanggan",
      cell: ({ row }) => (
        <Link
          href={`/master/pelanggan/${row.original.customerId}`}
          className="text-foreground hover:underline"
        >
          {row.original.customer?.name ?? "-"}
        </Link>
      ),
      size: 180,
    },
    {
      id: "brand",
      header: "Merek",
      cell: ({ row }) => row.original.vehicle?.variant?.model?.brand?.name ?? "-",
      size: 120,
    },
    {
      id: "model",
      header: "Model",
      cell: ({ row }) => row.original.vehicle?.variant?.model?.name ?? "-",
      size: 130,
    },
    {
      id: "variant",
      header: "Varian",
      cell: ({ row }) => row.original.vehicle?.variant?.name ?? "-",
      size: 120,
    },
    {
      id: "year",
      header: "Tahun",
      cell: ({ row }) => row.original.vehicle?.year ?? "-",
      size: 80,
    },
    {
      id: "chassisNumber",
      header: "No. Rangka",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.chassisNumber ?? "-"}</span>,
      size: 150,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusChip status={row.original.isActive ? "active" : "inactive"} />,
      size: 90,
      enableSorting: false,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Link
            href={`/master/pelanggan/${row.original.customerId}/kendaraan/${row.original.id}`}
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-all"
            aria-label="Detail"
          >
            <Eye size={15} />
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
      ariaLabel="Daftar kendaraan pelanggan"
      searchPlaceholder="Cari plat, rangka, mesin, model, atau pelanggan..."
      serverPagination={{ total, page, pageSize }}
      searchParam="cari"
    />
  )
}
