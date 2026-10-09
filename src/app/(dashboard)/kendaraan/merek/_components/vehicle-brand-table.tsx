"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface VehicleBrandData {
  id: number
  name: string
  slug: string | null
  _count: { models: number }
}

const columnHelper = createColumnHelper<VehicleBrandData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Merek",
    // Card headline on mobile.
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/kendaraan/merek", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/kendaraan/merek", info.row.original)}
        editHref={entityEditHref("/kendaraan/merek", info.row.original)}
        deleteAction={deleteVehicleBrand}
        deleteId={info.row.original.id}
        editPermission="edit_vehicle_brands"
        deletePermission="delete_vehicle_brands"
      />
    ),
  }),
]

interface VehicleBrandTableProps {
  data: VehicleBrandData[]
  total: number
  page: number
  pageSize: number
}

export function VehicleBrandTable({ data, total, page, pageSize }: VehicleBrandTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar merek kendaraan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari merek..."
      onBulkDelete={(ids) => bulkDelete("vehicleBrand", ids)}
    />
  )
}
