"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import { TicketSlaChip } from "@/components/reports/ticket-sla-chip"
import type { CrmTicketSlaPrimaryState } from "@/lib/reports/crm-ticket-sla"

interface TicketData {
  id: number
  slug: string | null
  subject: string
  priority: string
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<TicketData>()

function buildColumns(slaByTicketId?: ReadonlyMap<number, CrmTicketSlaPrimaryState>) {
  return [
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
  // 001-U: kolom SLA sesudah Status; keadaan dari primaryState server
  // per id tiket (peta dibangun halaman dari loader SLA), tanpa hitung.
  columnHelper.display({
    id: "sla",
    header: "SLA",
    enableSorting: false,
    cell: (info) => {
      const state = slaByTicketId?.get(info.row.original.id)
      return state ? <TicketSlaChip primaryState={state} /> : null
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
}

interface TicketTableProps {
  data: TicketData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
  /** Keadaan SLA server per id tiket (primaryState); absen = tanpa lencana. */
  slaByTicketId?: ReadonlyMap<number, CrmTicketSlaPrimaryState>
}

export function TicketTable({ data, total, page, pageSize, toolbar, filters, slaByTicketId }: TicketTableProps) {
  return (
    <DataTable
      data={data}
      columns={buildColumns(slaByTicketId)}
      ariaLabel="Daftar tiket dukungan"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
