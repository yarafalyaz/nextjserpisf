"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVehicleModel } from "@/actions/vehicle.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface VehicleModelData {
  id: number
  name: string
  brand: { name: string }
  _count: { variants: number }
}

const columnHelper = createColumnHelper<VehicleModelData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Model",
    cell: (info) => (
      <Link href={`/kendaraan/model/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("brand.name", {
    header: "Merek",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("_count.variants", {
    header: "Jumlah Varian",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/kendaraan/model/${info.row.original.id}`}
        editHref={`/kendaraan/model/${info.row.original.id}/ubah`}
        deleteAction={deleteVehicleModel}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface VehicleModelTableProps {
  data: VehicleModelData[]
}

export function VehicleModelTable({ data }: VehicleModelTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar model kendaraan"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("vehicleModel", ids)}
    />
  )
}
