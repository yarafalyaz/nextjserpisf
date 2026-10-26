import type { AttendanceCorrectionRow } from "@/lib/reports/attendance-correction"
import { formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "@/components/reports/report-card-shell"
import { attendanceStatusLabel } from "./attendance-labels"
import { AttendanceCorrectionActions } from "./attendance-correction-actions"
import { wibMinutesOfDay } from "@/lib/utils/attendance-time"

/** Instan UTC → jam dinding WIB `HH:MM`; null = "-". */
function timeLabel(instant: Date | null): string {
  if (!instant) return "-"
  const minutes = wibMinutesOfDay(instant)
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

export const ATTENDANCE_CORRECTION_TITLE = "Koreksi Absensi"

type Values = { status: string | null; checkIn: Date | null; checkOut: Date | null; notes: string | null }

/** Satu nilai absensi (status + jam + catatan); `null` values = rekod belum ada. */
function ValueCell({ values, emptyText }: Readonly<{ values: Values | null; emptyText: string }>) {
  if (!values) return <span className="text-muted-foreground">{emptyText}</span>
  return (
    <span className="flex flex-col gap-0.5">
      <span>{values.status ? attendanceStatusLabel(values.status) : "-"}</span>
      <span className="text-xs text-muted-foreground">
        {timeLabel(values.checkIn)} – {timeLabel(values.checkOut)}
      </span>
      {values.notes ? <span className="text-xs text-muted-foreground">{values.notes}</span> : null}
    </span>
  )
}

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
  return (
    <ReportCardShell
      label={ATTENDANCE_CORRECTION_TITLE}
      title={ATTENDANCE_CORRECTION_TITLE}
      summary={`${rows.length} pengajuan`}
      isEmpty={rows.length === 0}
      emptyText="Belum ada pengajuan koreksi absensi"
    >
      <div className="overflow-x-auto">
        <DetailTable aria-label="Daftar pengajuan koreksi absensi">
          <DetailTableHead>
            <DetailTableTh>Karyawan / Tanggal</DetailTableTh>
            <DetailTableTh>Saat Pengajuan</DetailTableTh>
            <DetailTableTh>Rekod Terkini</DetailTableTh>
            <DetailTableTh>Usulan Koreksi</DetailTableTh>
            <DetailTableTh>Status Pengajuan</DetailTableTh>
            <DetailTableTh>Aksi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => {
              const pending = row.status === "pending"
              const isSelf = currentEmployeeId != null && row.employeeId === currentEmployeeId
              return (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <span className="font-medium text-foreground">
                      {row.employeeName ?? "Karyawan tidak tercatat"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(row.date)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Diajukan {formatDate(row.createdAt)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
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
                  </DetailTableTd>
                  <DetailTableTd>
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
                  </DetailTableTd>
                  <DetailTableTd>
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
                  </DetailTableTd>
                  <DetailTableTd>
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
                  </DetailTableTd>
                  <DetailTableTd>
                    {pending ? (
                      <AttendanceCorrectionActions
                        correctionId={row.id}
                        canApprove={canApprove && !isSelf}
                        canCancel={canCreate && isSelf}
                      />
                    ) : null}
                  </DetailTableTd>
                </DetailTableRow>
              )
            })}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
