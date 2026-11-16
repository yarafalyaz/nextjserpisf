"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { ApplicantStageSelect, HireButton } from "../../_components/applicant-actions"

export interface VacancyApplicantRow {
  id: number
  name: string
  email: string | null
  phone: string | null
  source: string | null
  stage: string
  hiredEmployee: {
    id: number
    employeeNo: string
    slug: string | null
  } | null
}

const STAGE_LABELS: Record<string, string> = {
  applied: "Melamar",
  screening: "Seleksi Berkas",
  interview: "Wawancara",
  offering: "Penawaran",
  hired: "Diterima",
  rejected: "Ditolak",
}

const columnHelper = createColumnHelper<VacancyApplicantRow>()

export function VacancyApplicantsTable({
  data,
  canEdit,
}: {
  data: VacancyApplicantRow[]
  canEdit: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Nama",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "contact",
        header: "Kontak",
        cell: (info) => {
          const a = info.row.original
          return [a.email, a.phone].filter(Boolean).join(" · ") || "-"
        },
      }),
      columnHelper.accessor("source", {
        header: "Sumber",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("stage", {
        header: "Tahapan",
        cell: (info) => {
          const a = info.row.original
          const terminal = a.stage === "hired" || a.stage === "rejected"
          if (terminal) {
            return (
              <StatusChip
                status={a.stage}
                customLabel={STAGE_LABELS[a.stage] ?? a.stage}
              />
            )
          }
          return (
            <ApplicantStageSelect
              applicantId={a.id}
              stage={a.stage}
              disabled={false}
              canEdit={canEdit}
            />
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        cell: (info) => {
          const a = info.row.original
          if (a.stage === "hired" && a.hiredEmployee) {
            return (
              <Link
                href={`/master/karyawan/${a.hiredEmployee.slug ?? a.hiredEmployee.id}`}
                className="hover:underline font-mono text-xs"
              >
                {a.hiredEmployee.employeeNo}
              </Link>
            )
          }
          if (
            a.stage === "offering" ||
            a.stage === "interview" ||
            a.stage === "screening" ||
            a.stage === "applied"
          ) {
            return <HireButton applicantId={a.id} disabled={false} canEdit={canEdit} />
          }
          return "-"
        },
      }),
    ],
    [canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pelamar"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
