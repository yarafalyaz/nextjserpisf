"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface VehicleBrandData {
  id: number
  name: string
  _count: { models: number }
}

const columnHelper = createColumnHelper<VehicleBrandData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Merek",
    cell: (info) => (
      <Link href={`/kendaraan/merek/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("_count.models", {
    header: "Jumlah Model",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/kendaraan/merek/${info.row.original.id}`}
        editHref={`/kendaraan/merek/${info.row.original.id}/ubah`}
        deleteAction={deleteVehicleBrand}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface VehicleBrandTableProps {
  data: VehicleBrandData[]
}

export function VehicleBrandTable({ data }: VehicleBrandTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar merek kendaraan"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari merek..."
      onBulkDelete={(ids) => bulkDelete("vehicleBrand", ids)}
    />
  )
}
