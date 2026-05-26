"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteVendor } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Vendor {
  id: number
  name: string
  phone: string | null
  city: string | null
  isActive: boolean
}

const columnHelper = createColumnHelper<Vendor>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/vendors/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("phone", {
    header: "Telepon",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("city", {
    header: "Kota",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <StatusChip status={info.getValue() ? "Aktif" : "Nonaktif"} />
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/master/vendors/${info.row.original.id}`}
        editHref={`/master/vendors/${info.row.original.id}/edit`}
        deleteAction={deleteVendor}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface VendorTableProps {
  data: Vendor[]
}

export function VendorTable({ data }: VendorTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar vendor"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("vendor", ids)}
    />
  )
}
