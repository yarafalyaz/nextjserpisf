"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { CycleStatusButton } from "./cycle-actions"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { Calendar, Target, CheckCircle2 } from "@/components/ui/fontawesome-icons"

export interface PerformanceCycleRow {
  id: number
  name: string
  slug: string | null
  status: string
  periodStart: Date | string
  periodEnd: Date | string
  _count: { reviews: number; goals: number }
}

const columnHelper = createColumnHelper<PerformanceCycleRow>()

export function createPerformanceColumns(canEdit: boolean) {
  return [
    columnHelper.accessor("name", {
      header: "Siklus Penilaian",
      cell: (info) => (
        <Link
          href={`/sdm/kinerja/${info.row.original.slug ?? info.row.original.id}`}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor((row) => `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}`, {
      id: "period",
      header: "Periode",
      cell: (info) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span>{info.getValue()}</span>
        </span>
      ),
    }),
    columnHelper.accessor((row) => row._count.reviews, {
      id: "reviews",
      header: "Ulasan Karyawan",
      cell: (info) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{formatNumber(info.getValue())} ulasan</span>
        </span>
      ),
    }),
    columnHelper.accessor((row) => row._count.goals, {
      id: "goals",
      header: "Sasaran KPI",
      cell: (info) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
          <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{formatNumber(info.getValue())} sasaran</span>
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => <StatusChip status={info.getValue()} />,
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: (info) => (
        <CycleStatusButton
          cycleId={info.row.original.id}
          status={info.row.original.status}
          canEdit={canEdit}
        />
      ),
    }),
  ]
}

interface PerformanceTableProps {
  data: PerformanceCycleRow[]
  canEdit: boolean
}

export function PerformanceTable({ data, canEdit }: PerformanceTableProps) {
  const columns = createPerformanceColumns(canEdit)
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar siklus penilaian kinerja"
    />
  )
}
