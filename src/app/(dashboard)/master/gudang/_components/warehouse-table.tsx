"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteWarehouse } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { BULK_DELETE_PERMISSIONS, type BulkDeleteModel } from "@/lib/auth/bulk-delete-models"
import { useBulkDeleteSessionUser } from "@/components/ui/data-table-bulk-select"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Warehouse {
  id: number
  code: string
  name: string
  slug: string | null
  racks: unknown[]
  address: string | null
}

const columnHelper = createColumnHelper<Warehouse>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/master/gudang", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("racks", {
    header: "Jumlah Rak",
    cell: (info) => `${info.getValue().length} rak`,
  }),
  columnHelper.accessor("address", {
    header: "Alamat",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/master/gudang", info.row.original)}
        editHref={entityEditHref("/master/gudang", info.row.original)}
        deleteAction={deleteWarehouse}
        deleteId={info.row.original.id}
        editPermission="edit_warehouses"
        deletePermission="delete_warehouses"
      />
    ),
  }),
]

interface WarehouseTableProps {
  data: Warehouse[]
  total: number
  page: number
  pageSize: number
}

const BULK_MODEL: BulkDeleteModel = "warehouse"

export function WarehouseTable({ data, total, page, pageSize }: WarehouseTableProps) {
  const bulkDeleteUser = useBulkDeleteSessionUser()
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar gudang"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete(BULK_MODEL, ids)}
      bulkDeletePermission={BULK_DELETE_PERMISSIONS[BULK_MODEL]}
      bulkDeleteUser={bulkDeleteUser}
    />
  )
}
