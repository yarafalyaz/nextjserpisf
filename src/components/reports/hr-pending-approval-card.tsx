import Link from "next/link"

import type { HrPendingApprovalRow } from "@/lib/reports/hr-pending-approval"
import { HR_PENDING_NOTICE_TEXT } from "@/lib/reports/hr-pending-approval"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import { LEAVE_TYPE_LABELS, labelFrom } from "@/lib/utils/status-labels"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

export const HR_PENDING_APPROVAL_TITLE = "Antrean Persetujuan HR Tertunda"

const BASE_STAGE_TONES = {
  MENUNGGU_KEPUTUSAN: "warning",
  MENGENDAP: "danger",
} as const

const DATE_FLAG_TONES = {
  MENDEKATI_MULAI: "accent",
  TANGGAL_LEWAT_BELUM_DIPUTUS: "danger",
} as const

/**
 * F-2026-10-25-007-S (konsumen UI): antrean persetujuan HR tertunda.
 * Murni presentasi dari `loadHrPendingApprovalQueue` — tahap, umur, sisa
 * hari tampil verbatim server; UI tidak menghitung umur/tanggal sendiri
 * (BR-HP-09, AC-HP-F1) dan tidak memuat nominal apa pun (BR-HP-08).
 * Aksi per baris hanya tautan ke detail dokumen existing; keputusan tetap
 * lewat StatusActions/rantai existing di halaman detail (BR-HP-06, AC-HP-F2).
 */
export function HrPendingApprovalCard({
  rows,
}: Readonly<{ rows: HrPendingApprovalRow[] }>) {
  return (
    <ReportCardShell
      label={HR_PENDING_APPROVAL_TITLE}
      title={HR_PENDING_APPROVAL_TITLE}
      summary={`${rows.length} pengajuan menunggu keputusan`}
      isEmpty={rows.length === 0}
      emptyText="Belum ada pengajuan cuti atau lembur yang menunggu keputusan"
    >
      <p className="text-xs text-muted-foreground">{HR_PENDING_NOTICE_TEXT}</p>
      <div className="mt-3">
        <DetailTable aria-label="Daftar antrean persetujuan HR tertunda">
          <DetailTableHead>
            <DetailTableTh>Karyawan</DetailTableTh>
            <DetailTableTh>Jenis</DetailTableTh>
            <DetailTableTh>Tahap</DetailTableTh>
            <DetailTableTh>Tanggal Mulai/Lembur</DetailTableTh>
            <DetailTableTh align="right">Umur Menunggu</DetailTableTh>
            <DetailTableTh align="right">Sisa ke Tanggal</DetailTableTh>
            <DetailTableTh>Rincian</DetailTableTh>
            <DetailTableTh>Aksi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => {
              const detailHref = entityHref(
                row.kind === "leave" ? "/sdm/cuti" : "/sdm/lembur",
                row,
              )
              return (
                <DetailTableRow key={`${row.kind}-${row.id}`}>
                  <DetailTableTd>
                    {row.employeeName}
                    <span className="block text-xs text-muted-foreground">
                      {row.departmentName ?? "—"}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.kind === "leave" ? "Cuti" : "Lembur"}
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="flex flex-wrap gap-1.5">
                      <StatusChip
                        status={row.tahapDasar}
                        customLabel={row.tahapDasarLabel}
                        customTone={BASE_STAGE_TONES[row.tahapDasar]}
                      />
                      {row.penandaTanggal && row.penandaTanggalLabel ? (
                        <StatusChip
                          status={row.penandaTanggal}
                          customLabel={row.penandaTanggalLabel}
                          customTone={DATE_FLAG_TONES[row.penandaTanggal]}
                        />
                      ) : null}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {formatDate(row.eventDate)}
                    {row.kind === "leave" && row.endDate ? (
                      <span className="block text-xs text-muted-foreground">
                        s.d. {formatDate(row.endDate)}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.umurMenungguHari} hari
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.sisaHariKeTanggal} hari
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.kind === "leave" ? (
                      <>
                        {labelFrom(LEAVE_TYPE_LABELS, row.leaveType)}
                        {row.reason ? (
                          <span className="block text-xs text-muted-foreground">
                            {row.reason}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {row.hours ? `${row.hours} jam` : "—"}
                        {row.projectName ? (
                          <span className="block text-xs text-muted-foreground">
                            {row.projectName}
                          </span>
                        ) : null}
                        {row.reason ? (
                          <span className="block text-xs text-muted-foreground">
                            {row.reason}
                          </span>
                        ) : null}
                      </>
                    )}
                  </DetailTableTd>
                  <DetailTableTd>
                    <Link
                      href={detailHref}
                      className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                    >
                      Buka Detail
                    </Link>
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
