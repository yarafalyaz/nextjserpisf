import {
  DP_QUEUE_COLUMN_TITLES,
  DP_QUEUE_LEVEL_LABELS,
  DP_QUEUE_LEVELS,
  DP_QUEUE_NOTICE_TEXT,
  DP_QUEUE_TITLE,
  type DownPaymentQueueRow,
  type DownPaymentQueueSummary,
  type DpQueueLevel,
} from "@/lib/reports/down-payment-verification-queue"
import { formatCurrency } from "@/lib/utils/format"
import { ReportCardShell, ReportSummaryStrip } from "./report-card-shell"
import { DpQueueRow } from "./dp-queue-row"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<DpQueueLevel, "accent" | "default"> = {
  membuka_invoice: "accent",
  menunggu: "default",
}

/**
 * F-2026-10-26-051-S: antrean verifikasi DP menunggu konfirmasi.
 *
 * Data loader read-only `getDownPaymentVerificationQueue` (izin
 * `view_down_payments` fail-closed di loader + halaman) — umur, tingkat,
 * jarak ambang, penanda bukti, dan rekap ditampilkan apa adanya dari
 * builder; UI tidak menghitung ulang dan tidak mengurut ulang. Sen
 * ditampilkan lewat `formatCurrency(sen / 100)` tanpa perbandingan baru.
 * Baca-saja: nol tombol Konfirmasi/Tolak/Ubah/Hapus di antrean —
 * konfirmasi tetap lewat detail uang muka existing. Isi/path bukti tidak
 * pernah masuk payload; baris hanya membawa boolean + label bukti.
 * Tautan penawaran/faktur: hanya penawaran yang ada di payload (faktur
 * lahir di mesin konfirmasi sesudah DP terkonfirmasi — antrean tidak
 * mengarang tautan faktur).
 */
export function DownPaymentVerificationQueueCard({
  rows,
  summary,
}: Readonly<{
  rows: DownPaymentQueueRow[]
  summary: DownPaymentQueueSummary
}>) {
  const levelCounts: Record<DpQueueLevel, number> = {
    membuka_invoice: summary.membukaInvoice,
    menunggu: summary.menunggu,
  }
  const levelLabels = DP_QUEUE_LEVEL_LABELS
  const stripItems: Array<readonly [string, number]> = [
    ...DP_QUEUE_LEVELS.map(
      (level) => [`${levelLabels[level]}`, levelCounts[level]] as const,
    ),
    ["Bukti belum ada", summary.tanpaBukti] as const,
    ...(summary.takTerklasifikasi > 0
      ? [["Status lain (di luar antrean)", summary.takTerklasifikasi] as const]
      : []),
  ]
  return (
    <ReportCardShell
      label={DP_QUEUE_TITLE}
      title={DP_QUEUE_TITLE}
      summary={
        <>
          {summary.total} uang muka menunggu verifikasi —{" "}
          {formatCurrency(summary.totalAmountSen / 100)} belum menjadi kas
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Belum ada uang muka yang menunggu verifikasi"
      notice={DP_QUEUE_NOTICE_TEXT}
    >
      <div className="mt-1">
        <ReportSummaryStrip items={stripItems} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Pelanggan</DetailTableTh>
              <DetailTableTh>No. Uang Muka</DetailTableTh>
              <DetailTableTh>No. Penawaran</DetailTableTh>
              <DetailTableTh>Status Penawaran</DetailTableTh>
              <DetailTableTh>Tanggal Bayar (klaim)</DetailTableTh>
              <DetailTableTh>{DP_QUEUE_COLUMN_TITLES.menunggu}</DetailTableTh>
              <DetailTableTh align="right">Jumlah</DetailTableTh>
              <DetailTableTh>{DP_QUEUE_COLUMN_TITLES.bukti}</DetailTableTh>
              <DetailTableTh>{DP_QUEUE_COLUMN_TITLES.jarakAmbang}</DetailTableTh>
              <DetailTableTh>Tingkat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DpQueueRow key={row.downPaymentId} row={row} tones={LEVEL_TONES} />
              ))}
            </DetailTableBody>
        </DetailTable>
        </div>
    </ReportCardShell>
  )
}
