"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface LeadData {
  id: number
  slug: string | null
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
      <Link href={entityHref("/crm/leads", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/crm/leads", info.row.original)}
        editHref={entityEditHref("/crm/leads", info.row.original)}
        editPermission="edit_leads"
        deletePermission="delete_leads"
      />
    ),
  }),
]

interface LeadTableProps {
  data: LeadData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function LeadTable({ data, total, page, pageSize, toolbar, filters }: LeadTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar prospek"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("lead", ids)}
    />
  )
}
