import Link from "next/link"

import type { DisciplinaryAttentionLists, DisciplinaryRecordRow } from "@/lib/reports/disciplinary-data"
import { formatDate } from "@/lib/utils/format"
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

export const DISCIPLINARY_TITLE = "Surat Peringatan Karyawan"

export const DISCIPLINARY_NOTICE_TEXT =
  "Status aktif/kedaluwarsa dan daftar perhatian diturunkan server dari tanggal terbit dan masa berlaku 6 bulan — ditampilkan apa adanya."

/**
 * DISC-F1 (konsumen UI F-2026-10-25-005-S): daftar perhatian disiplin dari
 * loader server. Murni presentasi: jenjang, status turunan active|expired,
 * dan daftar perhatian dipakai verbatim payload (UI tidak hitung jenjang/
 * masa berlaku, spec §10). Tanpa field gaji apa pun (BR-DISC-08, AC-DISC-8).
 */
export function DisciplinaryAttentionCard({
  attention,
}: Readonly<{ attention: DisciplinaryAttentionLists }>) {
  const { active, expiringWithin30Days, highestRisk } = attention

  return (
    <ReportCardShell
      label={DISCIPLINARY_TITLE}
      title={DISCIPLINARY_TITLE}
      summary={`${active.length} SP aktif · ${expiringWithin30Days.length} kedaluwarsa ≤30 hari · ${highestRisk.length} risiko tertinggi`}
      isEmpty={active.length === 0}
      emptyText="Belum ada surat peringatan yang aktif"
    >
      <p className="text-xs text-muted-foreground">{DISCIPLINARY_NOTICE_TEXT}</p>
      <div className="mt-3">
        <DetailTable aria-label="Daftar perhatian surat peringatan aktif">
          <DetailTableHead>
            <DetailTableTh>Karyawan</DetailTableTh>
            <DetailTableTh>Departemen</DetailTableTh>
            <DetailTableTh>Jenjang</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
            <DetailTableTh>Tanggal Terbit</DetailTableTh>
            <DetailTableTh>Kedaluwarsa</DetailTableTh>
            <DetailTableTh>Perhatian</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {active.map((row) => (
              <DetailTableRow key={row.id}>
                <DetailTableTd>
                  <Link
                    href={`/master/karyawan/${row.employeeId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.employeeName}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.departmentName ?? "—"}</DetailTableTd>
                <DetailTableTd>{row.levelLabel ?? row.level}</DetailTableTd>
                <DetailTableTd>
                  <StatusChip status={row.derivedStatus} />
                </DetailTableTd>
                <DetailTableTd>{row.issuedAt ? formatDate(row.issuedAt) : "—"}</DetailTableTd>
                <DetailTableTd>{row.expiresAt ? formatDate(row.expiresAt) : "—"}</DetailTableTd>
                <DetailTableTd>
                  <AttentionBadges row={row} lists={{ expiringWithin30Days, highestRisk }} />
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}

function AttentionBadges({
  row,
  lists,
}: Readonly<{
  row: DisciplinaryRecordRow
  lists: Pick<DisciplinaryAttentionLists, "expiringWithin30Days" | "highestRisk">
}>) {
  // Keanggotaan daftar dibaca dari payload loader apa adanya (bukan hitung
  // ulang tanggal di UI).
  const expiring = lists.expiringWithin30Days.some((r) => r.id === row.id)
  const risk = lists.highestRisk.some((r) => r.id === row.id)
  if (!expiring && !risk) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {risk ? <StatusChip status="highest-risk" customLabel="Risiko tertinggi" customTone="danger" /> : null}
      {expiring ? <StatusChip status="expiring-soon" customLabel="Kedaluwarsa ≤30 hari" customTone="warning" /> : null}
    </span>
  )
}
