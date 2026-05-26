"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"

interface VehicleData {
  id: number
  plateNumber: string | null
  brandName: string | null
  modelName: string | null
  customerName: string | null
}

const columnHelper = createColumnHelper<VehicleData>()

const columns = [
  columnHelper.accessor("plateNumber", {
    header: "No. Plat",
    cell: (info) => (
      <Link href={`/vehicles/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  columnHelper.accessor("brandName", {
    header: "Merek",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("modelName", {
    header: "Model",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("customerName", {
    header: "Customer",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/vehicles/${info.row.original.id}`}
      />
    ),
  }),
]

interface VehicleTableProps {
  data: VehicleData[]
}

export function VehicleTable({ data }: VehicleTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kendaraan"
      pageSize={20}
      selectable={false}
    />
  )
}
