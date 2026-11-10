"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { Building2, Briefcase, Users } from "@/components/ui/fontawesome-icons"
import { formatNumber } from "@/lib/utils/format"

export interface VacancyRow {
  id: number
  code: string
  slug: string | null
  title: string
  status: string
  department: { name: string } | null
  position: { name: string } | null
  _count: { applicants: number }
}

const columnHelper = createColumnHelper<VacancyRow>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <Link
        href={`/sdm/rekrutmen/${info.row.original.slug ?? info.row.original.id}`}
        className="font-mono text-xs font-semibold text-primary hover:underline tracking-tight"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("title", {
    header: "Lowongan",
    cell: (info) => (
      <Link
        href={`/sdm/rekrutmen/${info.row.original.slug ?? info.row.original.id}`}
        className="font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.department?.name ?? "-", {
    id: "department",
    header: "Departemen",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>{info.getValue()}</span>
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.position?.name ?? "-", {
    id: "position",
    header: "Jabatan",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>{info.getValue()}</span>
      </span>
    ),
  }),
  columnHelper.accessor((row) => row._count.applicants, {
    id: "applicants",
    header: "Pelamar",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-foreground">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{formatNumber(info.getValue())} pelamar</span>
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

interface RecruitmentTableProps {
  data: VacancyRow[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function RecruitmentTable({ data, toolbar, filters }: RecruitmentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar lowongan pekerjaan"
      toolbar={toolbar}
      filters={filters}
    />
  )
}
