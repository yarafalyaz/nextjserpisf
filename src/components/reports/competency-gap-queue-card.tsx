import {
  COMPETENCY_GAP_BUCKET_LABELS,
  COMPETENCY_GAP_COLUMN_LABELS as COL,
  COMPETENCY_GAP_EMPTY_TEXT,
  COMPETENCY_GAP_NO_DATE_LABEL,
  COMPETENCY_GAP_NOTICE_TEXT,
  COMPETENCY_GAP_TITLE,
  type CompetencyGapQueue,
} from "@/lib/reports/competency-gap-queue"
import { formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell, ReportSummaryStrip } from "./report-card-shell"

/**
 * 078-F (konsumen UI F-2026-10-27-078-S, PUTUSAN LEAD Q-CGQ-1..8):
 * seksi daftar kesenjangan kompetensi di halaman kompetensi existing.
 * Murni presentasi: kolom/label/ember/kritis/notice/rekap verbatim
 * konstanta + payload builder server; UI nol hitung gap/rata-rata/rekap/
 * ember, nol peringkat, nol kontrol tulis (AC-CGQ-F1..F3).
 */
export function CompetencyGapQueueCard({
  queue,
}: Readonly<{ queue: CompetencyGapQueue }>) {
  const { rows, summary } = queue

  return (
    <ReportCardShell
      label={COMPETENCY_GAP_TITLE}
      title={COMPETENCY_GAP_TITLE}
      summary={
        <ReportSummaryStrip
          items={[
            [COMPETENCY_GAP_BUCKET_LABELS["belum-dinilai"], summary.belumDinilai],
            [COMPETENCY_GAP_BUCKET_LABELS["di-bawah-syarat"], summary.diBawahSyarat],
            [COMPETENCY_GAP_BUCKET_LABELS.memenuhi, summary.memenuhi],
          ]}
        />
      }
      isEmpty={rows.length === 0}
      emptyText={COMPETENCY_GAP_EMPTY_TEXT}
      notice={COMPETENCY_GAP_NOTICE_TEXT}
    >
      <div className="mt-3">
        <DetailTable aria-label={COMPETENCY_GAP_TITLE}>
          <DetailTableHead>
            <DetailTableTh>{COL.karyawan}</DetailTableTh>
            <DetailTableTh>{COL.jabatan}</DetailTableTh>
            <DetailTableTh>{COL.kompetensi}</DetailTableTh>
            <DetailTableTh>{COL.syarat}</DetailTableTh>
            <DetailTableTh>{COL.aktual}</DetailTableTh>
            <DetailTableTh>{COL.kesenjangan}</DetailTableTh>
            <DetailTableTh>{COL.dinilai}</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow
                key={`${row.employeeId}:${row.competencyId}`}
              >
                <DetailTableTd className="font-medium">
                  {row.employeeName}
                </DetailTableTd>
                <DetailTableTd>{row.positionName}</DetailTableTd>
                <DetailTableTd>{row.competencyName}</DetailTableTd>
                <DetailTableTd>{row.requiredLevel}</DetailTableTd>
                <DetailTableTd>
                  {row.currentLevel ?? row.bucketLabel}
                </DetailTableTd>
                <DetailTableTd>
                  {row.gap == null ? (
                    row.bucketLabel
                  ) : (
                    <>
                      {row.gap}
                      {row.criticalLabel ? (
                        <span className="ml-2 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {row.criticalLabel}
                        </span>
                      ) : null}
                    </>
                  )}
                </DetailTableTd>
                <DetailTableTd>
                  {row.assessedAt
                    ? formatDate(row.assessedAt)
                    : COMPETENCY_GAP_NO_DATE_LABEL}
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
