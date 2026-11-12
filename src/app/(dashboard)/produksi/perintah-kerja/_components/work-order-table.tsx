"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteWorkOrder } from "@/actions/manufacturing.actions"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import { Calendar, User } from "@/components/ui/fontawesome-icons"

interface WorkOrder {
  id: number
  documentNo: string
  slug: string | null
  status: string
  customer: { name: string }
  date: Date | string
}

const columnHelper = createColumnHelper<WorkOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={entityHref("/produksi/perintah-kerja", info.row.original)}
        className="font-mono text-sm font-semibold tracking-tight text-primary transition-colors hover:text-primary/80 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="truncate max-w-[200px]">{info.getValue()}</span>
      </span>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal Mulai",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <span>{formatDate(info.getValue())}</span>
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/produksi/perintah-kerja", info.row.original)}
        deleteAction={deleteWorkOrder}
        deleteId={info.row.original.id}
        editPermission="edit_work_orders"
        deletePermission="delete_work_orders"
      />
    ),
  }),
]

interface WorkOrderTableProps {
  data: WorkOrder[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function WorkOrderTable({ data, total, page, pageSize, toolbar, filters }: WorkOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar perintah kerja"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
