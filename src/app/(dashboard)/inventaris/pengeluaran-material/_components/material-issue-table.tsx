"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteMaterialIssue } from "@/actions/inventory.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface MaterialIssueItem {
  id: number
}

interface Warehouse {
  name: string
}

interface MaterialIssue {
  id: number
  documentNo: string
  warehouse: Warehouse
  date: string | Date
  items: MaterialIssueItem[]
  status: string
}

const columnHelper = createColumnHelper<MaterialIssue>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/inventaris/pengeluaran-material/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("warehouse.name", {
    header: "Gudang",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("items", {
    header: "Items",
    cell: (info) => `${info.getValue().length} item`,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/inventaris/pengeluaran-material/${info.row.original.id}`}
        deleteAction={deleteMaterialIssue}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface MaterialIssueTableProps {
  data: MaterialIssue[]
}

export function MaterialIssueTable({ data }: MaterialIssueTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar material issue"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("materialIssue", ids)}
    />
  )
}
