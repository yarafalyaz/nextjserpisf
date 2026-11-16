"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteProject } from "@/actions/project.actions"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface ProjectData {
  id: number
  slug: string | null
  name: string | null
  documentNo: string | null
  customer: { name: string }
  startDate: string | null
  endDate: string | null
  contractAmount: number | string | null
  stageProgressPct: number | null
  status: string
  _count?: { items: number }
}

const columnHelper = createColumnHelper<ProjectData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="font-mono text-xs">{val}</span> : "-"
    },
  }),
  columnHelper.accessor("customer.name", {
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Judul Proyek",
    cell: (info) => (
      <Link href={entityHref("/proyek", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue() || "-"}
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
  columnHelper.accessor("startDate", {
    header: "Mulai",
    cell: (info) => {
      const val = info.getValue()
      return <span className="font-mono tabular-nums whitespace-nowrap">{val ? formatDate(new Date(val)) : "-"}</span>
    },
  }),
  columnHelper.accessor("endDate", {
    header: "Tenggat",
    cell: (info) => {
      const val = info.getValue()
      if (!val) return <span className="text-muted-foreground">-</span>
      const end = new Date(val)
      const isOverdue =
        end.getTime() < Date.now() && info.row.original.status !== "completed"
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`font-mono tabular-nums ${isOverdue ? "text-destructive font-medium" : ""}`}>
            {formatDate(end)}
          </span>
          {isOverdue ? (
            <span className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-2xs font-medium text-destructive">
              Terlambat
            </span>
          ) : null}
        </div>
      )
    },
  }),
  columnHelper.accessor("contractAmount", {
    header: "Nilai Kontrak",
    cell: (info) => {
      const val = info.getValue()
      if (val === null || val === undefined || val === "") {
        return <span className="text-muted-foreground font-mono tabular-nums">-</span>
      }
      return (
        <span className="font-mono tabular-nums whitespace-nowrap">
          {formatCurrencyExact(Number(val))}
        </span>
      )
    },
  }),
  columnHelper.accessor("stageProgressPct", {
    header: "Progres",
    cell: (info) => {
      const pct = info.getValue()
      if (pct === null || pct === undefined) {
        return <span className="text-muted-foreground font-mono tabular-nums">-</span>
      }
      return (
        <div className="flex items-center gap-2 min-w-[84px]">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono tabular-nums text-xs">{pct}%</span>
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "itemsCount",
    header: "Item",
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {info.row.original._count?.items ?? 0}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/proyek", info.row.original)}
        editHref={entityEditHref("/proyek", info.row.original)}
        deleteAction={deleteProject}
        deleteId={info.row.original.id}
        editPermission="edit_projects"
        deletePermission="delete_projects"
      />
    ),
  }),
]

interface ProjectTableProps {
  data: ProjectData[]
  total: number
  page: number
  pageSize: number
  showContractAmount?: boolean
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function ProjectTable({
  data,
  total,
  page,
  pageSize,
  showContractAmount = false,
  toolbar,
  filters,
}: ProjectTableProps) {
  const visibleColumns = showContractAmount
    ? columns
    : columns.filter((col) => (col as { accessorKey?: string }).accessorKey !== "contractAmount")

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Daftar proyek"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
