"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"

interface LeadData {
  id: number
  name: string
  email: string | null
  company: string | null
  source: string | null
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<LeadData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/crm/leads/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("company", {
    header: "Perusahaan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("source", {
    header: "Sumber",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/crm/leads/${info.row.original.id}`}
        editHref={`/crm/leads/${info.row.original.id}/ubah`}
        editPermission="edit_leads"
        deletePermission="delete_leads"
      />
    ),
  }),
]

interface LeadTableProps {
  data: LeadData[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function LeadTable({ data, toolbar, filters }: LeadTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar leads"
      pageSize={20}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
