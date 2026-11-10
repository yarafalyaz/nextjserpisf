"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatNumber } from "@/lib/utils/format"
import { Briefcase, Users, Tag } from "@/components/ui/fontawesome-icons"

export interface CompetencyRow {
  id: number
  name: string
  category: string | null
  _count: {
    positionRequirements: number
    employeeCompetencies: number
  }
}

const columnHelper = createColumnHelper<CompetencyRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Kompetensi",
    cell: (info) => (
      <span className="font-semibold text-foreground tracking-tight">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.category ?? "-", {
    id: "category",
    header: "Kategori",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
        <Tag className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>{info.getValue()}</span>
      </span>
    ),
  }),
  columnHelper.accessor((row) => row._count.positionRequirements, {
    id: "positions",
    header: "Disyaratkan Jabatan",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
        <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{formatNumber(info.getValue())} jabatan</span>
      </span>
    ),
  }),
  columnHelper.accessor((row) => row._count.employeeCompetencies, {
    id: "employees",
    header: "Karyawan Dinilai",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{formatNumber(info.getValue())} dinilai</span>
      </span>
    ),
  }),
]

export function CompetencyTable({ data }: { data: CompetencyRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar standar kompetensi kerja"
    />
  )
}
