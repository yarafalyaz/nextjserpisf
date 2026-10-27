import {
  CUSTOMER_CREDIT_FP_UM_MARKER_LABEL,
  CUSTOMER_CREDIT_QUEUE_AGE_LABEL,
  CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT,
  CUSTOMER_CREDIT_QUEUE_TITLE,
  CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
  type CustomerCreditQueue,
} from "@/lib/reports/customer-credit-queue"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"

/**
 * 083-F (F-2026-10-27-083-S, vonis 085-V Putusan 1-6, AC-CCQ-F1..F3):
 * antrean saldo kredit pelanggan terbuka. Komponen murni presentasi atas
 * `CustomerCreditQueue` dari loader server (`getCustomerCreditQueue`,
 * PR #1144): saldo, umur, urutan, penanda FP UM, dan rekap ditempel apa
 * adanya lewat konstanta/tipe server — UI TIDAK menghitung saldo, umur,
 * tahap, atau penanda dari field mentah (payload tidak membawa
 * ppnUangMuka/djpStatus). Penanda FP UM tampil verbatim
 * `CUSTOMER_CREDIT_FP_UM_MARKER_LABEL` saat `penandaFpUangMuka` server
 * true; alokasi tidak terhalang penanda (field `alokasiTerhalang` selalu
 * false, J-RF1 menahan refund saja) — nol tombol Alokasi/Refund/bayar
 * dari antrean tahap 1 (Q-CCQ-5 belum dibuka Lead); penyelesaian tetap
 * lewat panel kredit per DP di detail uang muka, ditautkan untuk baris
 * sumber DownPayment. Anomali (ember terpisah server) tampil sebagai
 * hitungan peringatan di luar populasi/total (AC-CCQ-F3, Putusan 5).
 * RevisionDown tampil `sourceType` verbatim tanpa label terjurnal
 * (Putusan 3). Umur tampil angka server + label AGE_LABEL ("sejak
 * diterbitkan") tanpa tahap/ambang karangan (Q-CCQ-1/2/4/6 belum diputus).
 */
export function CustomerCreditQueueCard({
  queue,
}: Readonly<{ queue: CustomerCreditQueue }>) {
  const { rows, summary, anomaly } = queue
  const anomalyTotal =
    anomaly.openSaldoNol + anomaly.selesaiSaldoPositif + anomaly.alokasiMelebihiDiterima

  return (
    <section
      aria-label={CUSTOMER_CREDIT_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {CUSTOMER_CREDIT_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: {formatCurrency(summary.totalSaldo)} ·{" "}
          {formatNumber(summary.jumlahBaris)} baris · {formatNumber(summary.jumlahPenandaFpUangMuka)}{" "}
          berpenanda {CUSTOMER_CREDIT_FP_UM_MARKER_LABEL}
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT}</p>
        {anomalyTotal > 0 ? (
          <p className="text-xs font-medium text-destructive">
            Anomali warisan terpisah (tidak masuk populasi/total): {formatNumber(anomalyTotal)} baris —{" "}
            open saldo nol: {formatNumber(anomaly.openSaldoNol)} · selesai saldo positif:{" "}
            {formatNumber(anomaly.selesaiSaldoPositif)} · alokasi melebihi diterima:{" "}
            {formatNumber(anomaly.alokasiMelebihiDiterima)}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Tidak ada saldo kredit pelanggan terbuka.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b border-default text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">No. Dokumen</th>
                  <th scope="col" className="px-3 py-2 font-medium">Pelanggan</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sumber</th>
                  <th scope="col" className="px-3 py-2 font-medium">Umur {CUSTOMER_CREDIT_QUEUE_AGE_LABEL}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Diterima</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Dialokasikan</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Direfund</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Penanda</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.creditId} className="border-b border-default last:border-0">
                    <td className="px-3 py-2 align-top">
                      {row.sourceType === "DownPayment" ? (
                        <a
                          href={`/penjualan/uang-muka/${row.sourceId}`}
                          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                        >
                          {row.documentNo}
                        </a>
                      ) : (
                        <span className="font-medium">{row.documentNo}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">{row.customerName}</td>
                    <td className="px-3 py-2 align-top">{row.sourceType}</td>
                    <td className="px-3 py-2 align-top">{formatNumber(row.umurMenungguHari)} hari</td>
                    <td className="px-3 py-2 text-right align-top">{formatCurrency(row.receivedAmount)}</td>
                    <td className="px-3 py-2 text-right align-top">{formatCurrency(row.allocatedAmount)}</td>
                    <td className="px-3 py-2 text-right align-top">{formatCurrency(row.refundedAmount)}</td>
                    <td className="px-3 py-2 text-right align-top font-medium">{formatCurrency(row.saldo)}</td>
                    <td className="px-3 py-2 align-top">
                      {row.penandaFpUangMuka && row.penandaFpUangMukaLabel ? (
                        <span className="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-foreground">
                          {row.penandaFpUangMukaLabel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
