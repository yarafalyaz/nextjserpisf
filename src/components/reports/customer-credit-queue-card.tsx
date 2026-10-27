import Link from "next/link"

import {
  CUSTOMER_CREDIT_FP_UM_MARKER_LABEL,
  CUSTOMER_CREDIT_QUEUE_AGE_LABEL,
  CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT,
  CUSTOMER_CREDIT_QUEUE_TITLE,
  CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
  type CustomerCreditQueue,
} from "@/lib/reports/customer-credit-queue"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { ReportCardShell } from "./report-card-shell"

/**
 * 083-F (F-2026-10-27-083-S, vonis 085-V Putusan 1-6, AC-CCQ-F1..F3):
 * antrean saldo kredit pelanggan terbuka. Komponen murni presentasi atas
 * `CustomerCreditQueue` dari loader server (`getCustomerCreditQueue`,
 * PR #1144): saldo, umur, urutan, penanda FP UM, dan rekap ditempel apa
 * adanya lewat konstanta/tipe server — UI TIDAK menghitung saldo, umur,
 * tahap, atau penanda dari field mentah (payload tidak membawa
 * ppnUangMuka/djpStatus). Penanda FP UM tampil verbatim
 * `penandaFpUangMukaLabel` server saat `penandaFpUangMuka` true; alokasi
 * tidak terhalang penanda (`alokasiTerhalang` selalu false, J-RF1 menahan
 * refund saja) — nol tombol Alokasi/Refund/bayar dari antrean tahap 1
 * (Q-CCQ-5 belum dibuka Lead); penyelesaian tetap lewat panel kredit per
 * DP di detail uang muka, ditautkan untuk baris sumber DownPayment.
 * Anomali (ember terpisah server) tampil sebagai hitungan peringatan di
 * luar populasi/total (AC-CCQ-F3, Putusan 5). RevisionDown tampil
 * `sourceType` verbatim tanpa label terjurnal (Putusan 3). Umur tampil
 * angka server + label AGE_LABEL ("sejak diterbitkan") tanpa
 * tahap/ambang karangan (Q-CCQ-1/2/4/6 belum diputus).
 *
 * 086-B2 (kontrak PR #1151, 086-V Putusan 6): penanda FP UM juga bisa
 * `true` untuk baris `Quotation`/`RevisionDown` bila quotation sumbernya
 * tertahan gerbang refund server (residu F4 DP taxed ber-FP aktif > 0) —
 * bentuk field baris TIDAK berubah; kartu tetap menempel
 * `penandaFpUangMukaLabel` apa adanya untuk SEMUA `sourceType`, tanpa
 * cabang per sumber dan tanpa menyimpulkan tahan/tidak dari field
 * mentah. `alokasiTerhalang` tetap false (penanda menahan refund saja).
 */
export function CustomerCreditQueueCard({
  queue,
}: Readonly<{ queue: CustomerCreditQueue }>) {
  const { rows, summary, anomaly } = queue
  const hasAnomaly =
    anomaly.openSaldoNol > 0 ||
    anomaly.selesaiSaldoPositif > 0 ||
    anomaly.alokasiMelebihiDiterima > 0

  return (
    <ReportCardShell
      label={CUSTOMER_CREDIT_QUEUE_TITLE}
      title={CUSTOMER_CREDIT_QUEUE_TITLE}
      summary={
        <>
          {CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: {formatCurrency(summary.totalSaldo)} ·{" "}
          {formatNumber(summary.jumlahBaris)} baris · {formatNumber(summary.jumlahPenandaFpUangMuka)}{" "}
          berpenanda {CUSTOMER_CREDIT_FP_UM_MARKER_LABEL}
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Tidak ada saldo kredit pelanggan terbuka."
      notice={CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT}
    >
      {hasAnomaly ? (
        <p className="mb-3 text-xs font-medium text-danger">
          Anomali warisan terpisah (tidak masuk populasi/total): open saldo nol:{" "}
          {formatNumber(anomaly.openSaldoNol)} · selesai saldo positif:{" "}
          {formatNumber(anomaly.selesaiSaldoPositif)} · alokasi melebihi diterima:{" "}
          {formatNumber(anomaly.alokasiMelebihiDiterima)}
        </p>
      ) : null}
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>No. Dokumen</DetailTableTh>
          <DetailTableTh>Pelanggan</DetailTableTh>
          <DetailTableTh>Sumber</DetailTableTh>
          <DetailTableTh>Umur {CUSTOMER_CREDIT_QUEUE_AGE_LABEL}</DetailTableTh>
          <DetailTableTh align="right">Diterima</DetailTableTh>
          <DetailTableTh align="right">Dialokasikan</DetailTableTh>
          <DetailTableTh align="right">Direfund</DetailTableTh>
          <DetailTableTh align="right">Saldo</DetailTableTh>
          <DetailTableTh>Penanda</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.creditId}>
              <DetailTableTd>
                {row.sourceType === "DownPayment" ? (
                  <Link
                    href={`/penjualan/uang-muka/${row.sourceId}`}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                  >
                    {row.documentNo}
                  </Link>
                ) : (
                  <span className="font-medium">{row.documentNo}</span>
                )}
                <span className="block text-xs text-muted-foreground">
                  {formatDate(row.createdAt)}
                </span>
              </DetailTableTd>
              <DetailTableTd>{row.customerName}</DetailTableTd>
              <DetailTableTd>{row.sourceType}</DetailTableTd>
              <DetailTableTd>{formatNumber(row.umurMenungguHari)} hari</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.receivedAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.allocatedAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.refundedAmount)}</DetailTableTd>
              <DetailTableTd align="right">
                <span className="font-medium">{formatCurrency(row.saldo)}</span>
              </DetailTableTd>
              <DetailTableTd>
                {row.penandaFpUangMuka && row.penandaFpUangMukaLabel ? (
                  <span className="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-foreground">
                    {row.penandaFpUangMukaLabel}
                  </span>
                ) : (
                  "—"
                )}
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </ReportCardShell>
  )
}
