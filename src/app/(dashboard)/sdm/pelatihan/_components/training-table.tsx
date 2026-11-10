"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { Calendar, Building2, Users } from "@/components/ui/fontawesome-icons"

export interface TrainingRow {
  id: number
  title: string
  slug: string | null
  provider: string | null
  startDate: Date | string
  status: string
  _count: { participants: number }
}

const columnHelper = createColumnHelper<TrainingRow>()

const columns = [
  columnHelper.accessor("title", {
    header: "Program Pelatihan",
    cell: (info) => (
      <Link
        href={`/sdm/pelatihan/${info.row.original.slug ?? info.row.original.id}`}
        className="font-medium text-foreground hover:text-primary hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.provider ?? "-", {
    id: "provider",
    header: "Penyelenggara / Instansi",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>{info.getValue()}</span>
      </span>
    ),
  }),
  columnHelper.accessor("startDate", {
    header: "Tanggal Mulai",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>{formatDate(info.getValue())}</span>
      </span>
    ),
  }),
  columnHelper.accessor((row) => row._count.participants, {
    id: "participants",
    header: "Jumlah Peserta",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{formatNumber(info.getValue())} peserta</span>
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function TrainingTable({ data }: { data: TrainingRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pelatihan dan pengembangan SDM"
    />
  )
}
