"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

interface TicketData {
  id: number
  slug: string | null
  subject: string
  priority: string
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<TicketData>()

const columns = [
  columnHelper.accessor("subject", {
    header: "Subjek",
    cell: (info) => (
      <Link href={entityHref("/crm/tickets", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("priority", {
    header: "Prioritas",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
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
        viewHref={entityHref("/crm/tickets", info.row.original)}
        editPermission="edit_tickets"
        deletePermission="delete_tickets"
      />
    ),
  }),
]

interface TicketTableProps {
  data: TicketData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function TicketTable({ data, total, page, pageSize, toolbar, filters }: TicketTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar tiket dukungan"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
