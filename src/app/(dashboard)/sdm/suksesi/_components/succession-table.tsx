"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { CriticalToggle, RemoveSuccessorButton } from "./succession-actions"
import { Building2, User, Users } from "@/components/ui/fontawesome-icons"

export interface SuccessionCandidate {
  id: number
  rank: number
  employeeName: string
  readiness: string
}

export interface SuccessionOverviewRow {
  id: number
  positionId: number
  positionName: string
  departmentName: string | null
  incumbents: Array<{ id: number; name: string }>
  candidates: SuccessionCandidate[]
  coverage: string
}

const READINESS_LABELS: Record<string, string> = {
  ready_now: "Siap Sekarang",
  ready_1_2_years: "Siap 1-2 Tahun",
  ready_future: "Siap Masa Depan",
}

const columnHelper = createColumnHelper<SuccessionOverviewRow>()

export function createSuccessionColumns(canEdit: boolean, canDelete: boolean) {
  return [
    columnHelper.accessor("positionName", {
      header: "Jabatan Kritis",
      cell: (info) => (
        <span className="font-semibold text-foreground tracking-tight">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor((row) => row.departmentName ?? "-", {
      id: "department",
      header: "Departemen",
      cell: (info) => (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span>{info.getValue()}</span>
        </span>
      ),
    }),
    columnHelper.accessor((row) => (row.incumbents.length > 0 ? row.incumbents.map((i) => i.name).join(", ") : "Lowong"), {
      id: "incumbents",
      header: "Pemegang Saat Ini",
      cell: (info) => {
        const val = info.getValue()
        const isVacant = val === "Lowong"
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs ${isVacant ? "font-semibold text-destructive" : "text-foreground"}`}>
            <User className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <span>{val}</span>
          </span>
        )
      },
    }),
    columnHelper.accessor("candidates", {
      header: "Kandidat Pengganti",
      cell: (info) => {
        const candidates = info.getValue()
        if (candidates.length === 0) {
          return <span className="text-xs text-muted-foreground italic">Belum ada kandidat</span>
        }
        return (
          <ul className="flex flex-col gap-1.5 py-1">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary font-mono">
                    {c.rank}
                  </span>
                  <span className="font-medium text-foreground">{c.employeeName}</span>
                  <span className="text-[11px] text-muted-foreground">({READINESS_LABELS[c.readiness] ?? c.readiness})</span>
                </span>
                <RemoveSuccessorButton id={c.id} canDelete={canDelete} />
              </li>
            ))}
          </ul>
        )
      },
    }),
    columnHelper.accessor("coverage", {
      header: "Cakupan Suksesi",
      cell: (info) => {
        const cov = info.getValue()
        const statusMap: Record<string, string> = {
          covered: "completed",
          at_risk: "pending",
          vacant: "cancelled",
        }
        const labelMap: Record<string, string> = {
          covered: "Aman",
          at_risk: "Berisiko",
          vacant: "Kosong",
        }
        return <StatusChip status={statusMap[cov] ?? cov} customLabel={labelMap[cov] ?? cov} />
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Status Kritis",
      enableSorting: false,
      cell: (info) => (
        <CriticalToggle
          positionId={info.row.original.positionId}
          isCritical={true}
          canEdit={canEdit}
        />
      ),
    }),
  ]
}

interface SuccessionTableProps {
  data: SuccessionOverviewRow[]
  canEdit: boolean
  canDelete: boolean
}

export function SuccessionTable({ data, canEdit, canDelete }: SuccessionTableProps) {
  const columns = createSuccessionColumns(canEdit, canDelete)
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar suksesi jabatan kritis"
    />
  )
}

export interface AllPositionRow {
  id: number
  name: string
  isCritical: boolean
}

const posHelper = createColumnHelper<AllPositionRow>()

export function PositionCriticalityTable({
  data,
  canEdit,
}: {
  data: AllPositionRow[]
  canEdit: boolean
}) {
  const columns = [
    posHelper.accessor("name", {
      header: "Jabatan",
      cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
    }),
    posHelper.accessor("isCritical", {
      header: "Status Kritis",
      cell: (info) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
            info.getValue() ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          {info.getValue() ? "Kritis" : "Standar"}
        </span>
      ),
    }),
    posHelper.display({
      id: "actions",
      header: "Tindakan",
      enableSorting: false,
      cell: (info) => (
        <CriticalToggle
          positionId={info.row.original.id}
          isCritical={info.row.original.isCritical}
          canEdit={canEdit}
        />
      ),
    }),
  ]

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar seluruh jabatan dan status kritis"
    />
  )
}
