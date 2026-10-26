import Link from "next/link"
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
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
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
  return (
    <section
      aria-label={DP_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{DP_QUEUE_TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {summary.total} uang muka menunggu verifikasi —{" "}
          {formatCurrency(summary.totalAmountSen / 100)} belum menjadi kas
        </p>
        <ul aria-label="Rekap antrean verifikasi uang muka" className="mt-2 flex flex-wrap gap-1.5">
          {DP_QUEUE_LEVELS.map((level) => (
            <li key={level}>
              <StatusChip
                status={level}
                customLabel={`${levelLabels[level]}: ${levelCounts[level]}`}
                customTone={LEVEL_TONES[level]}
              />
            </li>
          ))}
          <li>
            <StatusChip
              status="tanpa_bukti"
              customLabel={`Bukti belum ada: ${summary.tanpaBukti}`}
              customTone="warning"
            />
          </li>
          {summary.takTerklasifikasi > 0 ? (
            <li>
              <StatusChip
                status="tak_terklasifikasi"
                customLabel={`Status lain (di luar antrean): ${summary.takTerklasifikasi}`}
                customTone="default"
              />
            </li>
          ) : null}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{DP_QUEUE_NOTICE_TEXT}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada uang muka yang menunggu verifikasi
          </p>
        ) : (
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
                  <DetailTableRow key={row.downPaymentId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={`/penjualan/uang-muka/${row.downPaymentId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={`/penjualan/penawaran/${row.quotationId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.quotationDocumentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.quotationStatus}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.paymentDate)}</DetailTableTd>
                    <DetailTableTd>{`${row.umurMenungguHari} hari`}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
                    <DetailTableTd>{row.buktiLabel}</DetailTableTd>
                    <DetailTableTd>
                      {row.jarakTeks}
                      {row.menungguLainSen > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          Menunggu lain {formatCurrency(row.menungguLainSen / 100)} (belum terhitung ambang)
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">
                        {row.ambangSumberLabel}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.tingkat}
                        customLabel={row.tingkatLabel}
                        customTone={LEVEL_TONES[row.tingkat]}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={`/penjualan/uang-muka/${row.downPaymentId}`}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        Buka Uang Muka
                      </Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </div>
    </section>
  )
}
