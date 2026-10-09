"use client"

import { createColumnHelper } from "@/lib/table"
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
    // Card headline on mobile: the model name is the natural title.
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={`/kendaraan/model/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
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
        editPermission="edit_vehicle_models"
        deletePermission="delete_vehicle_models"
      />
    ),
  }),
]

interface VehicleModelTableProps {
  data: VehicleModelData[]
  total: number
  page: number
  pageSize: number
}

export function VehicleModelTable({ data, total, page, pageSize }: VehicleModelTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar model kendaraan"
      selectable={true}
      searchPlaceholder="Cari model atau merek..."
      onBulkDelete={(ids) => bulkDelete("vehicleModel", ids)}
      serverPagination={{ total, page, pageSize }}
      searchParam="cari"
    />
  )
}
