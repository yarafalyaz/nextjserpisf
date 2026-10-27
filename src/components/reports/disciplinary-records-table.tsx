import Link from "next/link"

import type { DisciplinaryRecordRow } from "@/lib/reports/disciplinary-data"
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

/**
 * DISC-F1: daftar seluruh rekod disiplin dalam scope (termasuk draft,
 * menunggu persetujuan, ditolak, dibatalkan) dari loader server. Status
 * tampil = derivedStatus server apa adanya; UI tidak menurunkan ulang.
 */
export function DisciplinaryRecordsTable({
  records,
}: Readonly<{ records: DisciplinaryRecordRow[] }>) {
  return (
    <ReportCardShell
      label="Semua Rekod Disiplin"
      title="Semua Rekod Disiplin"
      summary={`${records.length} rekod dalam cakupan Anda`}
      isEmpty={records.length === 0}
      emptyText="Belum ada rekod disiplin dalam cakupan Anda"
    >
      <DetailTable aria-label="Daftar semua rekod disiplin">
        <DetailTableHead>
          <DetailTableTh>Karyawan</DetailTableTh>
          <DetailTableTh>Jenjang</DetailTableTh>
          <DetailTableTh>Kategori</DetailTableTh>
          <DetailTableTh>Tanggal Kejadian</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
          <DetailTableTh>Rincian</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {records.map((row) => (
            <DetailTableRow key={row.id}>
              <DetailTableTd>{row.employeeName}</DetailTableTd>
              <DetailTableTd>{row.levelLabel ?? row.level}</DetailTableTd>
              <DetailTableTd>{row.violationCategory}</DetailTableTd>
              <DetailTableTd>{formatDate(row.violationDate)}</DetailTableTd>
              <DetailTableTd>
                <StatusChip status={row.derivedStatus} />
                {row.isVoidRecord ? (
                  <span className="ml-1.5">
                    <StatusChip status="void-record" customLabel="Rekod pembatal" customTone="default" />
                  </span>
                ) : null}
                {row.voidedAt ? (
                  <span className="ml-1.5">
                    <StatusChip status="voided" customLabel="Dibatalkan" customTone="danger" />
                  </span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>
                <Link
                  href={`/sdm/disiplin/${row.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  Lihat
                </Link>
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </ReportCardShell>
  )
}
