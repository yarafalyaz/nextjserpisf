"use client"

import { useMemo } from "react"
import type { AttendanceCorrectionRow } from "@/lib/reports/attendance-correction"
import { formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { StatusChip } from "@/components/ui/status-chip"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { ReportCardShell } from "@/components/reports/report-card-shell"
import { attendanceStatusLabel } from "./attendance-labels"
import { AttendanceCorrectionActions } from "./attendance-correction-actions"
import { wibMinutesOfDay } from "@/lib/utils/attendance-time"

/** Instan UTC -> jam dinding WIB `HH:MM`; null = "-". */
function timeLabel(instant: Date | string | null): string {
  if (!instant) return "-"
  const date = instant instanceof Date ? instant : new Date(instant)
  const minutes = wibMinutesOfDay(date)
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

export const ATTENDANCE_CORRECTION_TITLE = "Koreksi Absensi"

type Values = { status: string | null; checkIn: Date | string | null; checkOut: Date | string | null; notes: string | null }

/** Satu nilai absensi (status + jam + catatan); `null` values = rekod belum ada. */
function ValueCell({ values, emptyText }: Readonly<{ values: Values | null; emptyText: string }>) {
  if (!values) return <span className="text-muted-foreground">{emptyText}</span>
  return (
    <span className="flex flex-col gap-0.5">
      <span>{values.status ? attendanceStatusLabel(values.status) : "-"}</span>
      <span className="text-xs text-muted-foreground font-mono tabular-nums">
        {timeLabel(values.checkIn)} - {timeLabel(values.checkOut)}
      </span>
      {values.notes ? <span className="text-xs text-muted-foreground">{values.notes}</span> : null}
    </span>
  )
}

const columnHelper = createColumnHelper<AttendanceCorrectionRow>()

/**
 * F-2026-10-25-010-S (konsumen UI PR #954): daftar pengajuan koreksi absensi
 * dalam scope HR pemanggil. Perbandingan 3 kolom snapshot pengajuan vs rekod
 * TERKINI vs usulan tampil verbatim dari loader `loadAttendanceCorrections`
 * (putusan Q-AC-2); baris `hasConflict` ditandai, UI tidak menghitung ulang
 * konflik/status/nilai apa pun. Aksi per baris hanya untuk baris pending:
 * putusan bagi pemegang approve, batal bagi pengaju sendiri (server tetap
 * penjaga terakhir).
 */
export function AttendanceCorrectionTable({
  rows,
  currentEmployeeId,
  canApprove,
  canCreate,
}: Readonly<{
  rows: AttendanceCorrectionRow[]
  currentEmployeeId: number | null
  canApprove: boolean
  canCreate: boolean
}>) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("employeeName", {
        header: "Karyawan / Tanggal",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const row = info.row.original
          return (
            <div>
              <span className="font-medium text-foreground">
                {row.employeeName ?? "Karyawan tidak tercatat"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatDate(row.date)}
              </span>
              <span className="block text-xs text-muted-foreground">
                Diajukan {formatDate(row.createdAt)}
              </span>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: "snapshot",
        header: "Saat Pengajuan",
        cell: (info) => {
          const row = info.row.original
          return (
            <ValueCell
              values={
                row.snapshotAttendanceId == null
                  ? null
                  : {
                      status: row.snapshotStatus,
                      checkIn: row.snapshotCheckIn,
                      checkOut: row.snapshotCheckOut,
                      notes: row.snapshotNotes,
                    }
              }
              emptyText="Belum ada rekod absensi tercatat"
            />
          )
        },
      }),
      columnHelper.display({
        id: "current",
        header: "Rekod Terkini",
        cell: (info) => {
          const row = info.row.original
          return (
            <ValueCell
              values={
                row.current
                  ? {
                      status: row.current.status,
                      checkIn: row.current.checkIn,
                      checkOut: row.current.checkOut,
                      notes: row.current.notes,
                    }
                  : null
              }
              emptyText="Belum ada rekod absensi tercatat"
            />
          )
        },
      }),
      columnHelper.display({
        id: "proposed",
        header: "Usulan Koreksi",
        cell: (info) => {
          const row = info.row.original
          return (
            <div>
              <ValueCell
                values={{
                  status: row.proposedStatus,
                  checkIn: row.proposedCheckIn,
                  checkOut: row.proposedCheckOut,
                  notes: row.proposedNotes,
                }}
                emptyText="Belum ada rekod absensi tercatat"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Alasan: {row.reason}
              </span>
            </div>
          )
        },
      }),
      columnHelper.accessor("status", {
        header: "Status Pengajuan",
        cell: (info) => {
          const row = info.row.original
          const pending = row.status === "pending"
          return (
            <span className="flex flex-col items-start gap-1.5">
              <StatusChip status={row.status} customLabel={statusLabel(row.status)} />
              {pending && row.hasConflict ? (
                <StatusChip
                  status="conflict"
                  customLabel="Konflik: Rekod Berubah"
                  customTone="danger"
                />
              ) : null}
              {row.status === "rejected" && row.rejectionReason ? (
                <span className="text-xs text-muted-foreground">
                  Alasan penolakan: {row.rejectionReason}
                </span>
              ) : null}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        cell: (info) => {
          const row = info.row.original
          const pending = row.status === "pending"
          const isSelf = currentEmployeeId != null && row.employeeId === currentEmployeeId
          if (!pending) return null
          return (
            <AttendanceCorrectionActions
              correctionId={row.id}
              canApprove={canApprove && !isSelf}
              canCancel={canCreate && isSelf}
            />
          )
        },
      }),
    ],
    [canApprove, canCreate, currentEmployeeId],
  )

  return (
    <ReportCardShell
      label={ATTENDANCE_CORRECTION_TITLE}
      title={ATTENDANCE_CORRECTION_TITLE}
      summary={`${rows.length} pengajuan`}
      isEmpty={rows.length === 0}
      emptyText="Belum ada pengajuan koreksi absensi"
    >
      <div className="p-4">
        <DataTable
          data={rows}
          columns={columns}
          ariaLabel="Daftar pengajuan koreksi absensi"
          selectable={false}
          enableColumnToggle={false}
          enableExport={false}
          pageSize={50}
        />
      </div>
    </ReportCardShell>
  )
}
