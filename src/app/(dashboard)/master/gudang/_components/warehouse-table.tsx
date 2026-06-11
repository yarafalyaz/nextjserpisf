"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteWarehouse } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Warehouse {
  id: number
  code: string
  name: string
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
      <Link href={`/master/gudang/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
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
        editHref={`/master/gudang/${info.row.original.id}/ubah`}
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
}

export function WarehouseTable({ data }: WarehouseTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar gudang"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete("warehouse", ids)}
    />
  )
}
