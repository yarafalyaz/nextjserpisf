"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteVendor } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Vendor {
  id: number
  name: string
  slug: string | null
  phone: string | null
  city: string | null
  isActive: boolean
}

const columnHelper = createColumnHelper<Vendor>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/master/vendor", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/master/vendor", info.row.original)}
        editHref={entityEditHref("/master/vendor", info.row.original)}
        deleteAction={deleteVendor}
        deleteId={info.row.original.id}
        editPermission="edit_vendors"
        deletePermission="delete_vendors"
      />
    ),
  }),
]

interface VendorTableProps {
  data: Vendor[]
  total: number
  page: number
  pageSize: number
}

export function VendorTable({ data, total, page, pageSize }: VendorTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar vendor"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau telepon vendor..."
      onBulkDelete={(ids) => bulkDelete("vendor", ids)}
    />
  )
}
