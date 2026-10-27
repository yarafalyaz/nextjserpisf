import Link from "next/link"
import {
  PAYROLL_DRAFT_COLUMN_LABELS,
  PAYROLL_DRAFT_LEVEL_LABELS,
  PAYROLL_DRAFT_NOTICE_TEXT,
  type PayrollDraftLevel,
  type PayrollDraftQueue,
} from "@/lib/reports/payroll-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { ReportCardShell } from "./report-card-shell"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<PayrollDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

const QUEUE_TITLE = "Antrean Slip Gaji Draft"

/**
 * 070-F (F-2026-10-26-070-S tahap 1, AC-PDQ-F1..F3): antrean slip gaji
 * draft mengendap. Komponen murni presentasi atas `PayrollDraftQueue`
 * dari loader server (`getPayrollDraftQueue`, Backend PR #1107): kolom,
 * label tingkat, notice, dan rekap ditempel verbatim konstanta server —
 * UI TIDAK menghitung umur/tingkat/count dan tidak mengurut ulang.
 * Payload tanpa nominal dalam bentuk apa pun (BR-PDQ-03); tautan baris
 * hanya ke detail slip existing; nol tombol Proses/Setujui/Bayar/Hapus.
 * Nama/pekerjaan/pembuat kosong tampil `—` (EC-PDQ-2).
 */
export function PayrollDraftQueueCard({
  queue,
}: Readonly<{ queue: PayrollDraftQueue }>) {
  const { rows, levelCounts, periodCounts, totalDocuments } = queue

  return (
    <ReportCardShell
      label={QUEUE_TITLE}
      title={QUEUE_TITLE}
      summary={
        <>
          {formatNumber(levelCounts.mengendap)} mengendap ·{" "}
          {formatNumber(levelCounts.menunggu)} menunggu proses ·{" "}
          {formatNumber(totalDocuments)} slip draft
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Tidak ada slip gaji draft."
      notice={PAYROLL_DRAFT_NOTICE_TEXT}
      contentClassName="flex flex-col gap-4"
    >
      {periodCounts.length > 0 ? (
        <ul aria-label="Rekap periode antrean slip gaji draft" className="flex flex-wrap gap-1.5">
          {periodCounts.map((entry) => (
            <li key={entry.period}>
              <StatusChip
                status={entry.period}
                customLabel={`${entry.period}: ${formatNumber(entry.total)} slip (${formatNumber(entry.levelCounts.mengendap)} ${PAYROLL_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()}, ${formatNumber(entry.levelCounts.menunggu)} ${PAYROLL_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()})`}
                customTone="default"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>{PAYROLL_DRAFT_COLUMN_LABELS.age}</DetailTableTh>
            <DetailTableTh>No. Slip</DetailTableTh>
            <DetailTableTh>Karyawan</DetailTableTh>
            <DetailTableTh>{PAYROLL_DRAFT_COLUMN_LABELS.period}</DetailTableTh>
            <DetailTableTh>{PAYROLL_DRAFT_COLUMN_LABELS.range}</DetailTableTh>
            <DetailTableTh>{PAYROLL_DRAFT_COLUMN_LABELS.type}</DetailTableTh>
            <DetailTableTh>{PAYROLL_DRAFT_COLUMN_LABELS.createdBy}</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.payrollId}>
                <DetailTableTd>
                  <StatusChip
                    status={row.tingkat}
                    customLabel={row.tingkatLabel}
                    customTone={LEVEL_TONES[row.tingkat]}
                  />
                  <span className="block text-xs text-muted-foreground">
                    {formatNumber(row.umurDraftHari)} hari
                  </span>
                </DetailTableTd>
                <DetailTableTd>
                  <Link
                    href={entityHref("/sdm/penggajian", { id: row.payrollId, slug: row.slug })}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                  >
                    {row.documentNo}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.employeeName ?? "—"}</DetailTableTd>
                <DetailTableTd>{row.period}</DetailTableTd>
                <DetailTableTd>
                  {formatDate(row.startDate)} – {formatDate(row.endDate)}
                </DetailTableTd>
                <DetailTableTd>{row.type}</DetailTableTd>
                <DetailTableTd>{row.createdByName ?? "—"}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
