import Link from "next/link"
import {
  VENDOR_PAYMENT_DRAFT_COLUMN_LABELS,
  VENDOR_PAYMENT_DRAFT_LEVEL_LABELS,
  VENDOR_PAYMENT_DRAFT_LEVELS,
  VENDOR_PAYMENT_DRAFT_NOTICE_TEXT,
  type VendorPaymentDraftLevel,
  type VendorPaymentDraftQueue,
} from "@/lib/reports/vendor-payment-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
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

export const VENDOR_PAYMENT_DRAFT_QUEUE_TITLE = "Pembayaran Vendor Draft Mengendap"

const LEVEL_TONES: Record<VendorPaymentDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

const QUEUE_TITLE = VENDOR_PAYMENT_DRAFT_QUEUE_TITLE

/**
 * 072-F (F-2026-10-26-072-S tahap 1, AC-VPQ-F1..F3): antrean pembayaran
 * vendor draft mengendap. Komponen murni presentasi atas
 * `VendorPaymentDraftQueue` dari loader server (`getVendorPaymentDraftQueue`,
 * Backend PR #1109 merged): kolom, label tingkat, notice, dan rekap ditempel
 * verbatim payload/konstanta server — UI TIDAK menghitung umur/tingkat/Σ
 * amount dan tidak mengurut ulang. Setiap Σ amount berlabel `totalLabel`
 * server ("nilai draft belum dibayar"); draft TIDAK berlabel kas keluar/
 * terbayar/pengurang utang/tunggakan. Tagihan tujuan/pembuat null tampil
 * `—` (BR-VPQ-07/09). Tautan baris hanya ke detail
 * pembayaran existing; nol tombol Konfirmasi/Alokasi/Tandai Transfer/Hapus.
 */
export function VendorPaymentDraftQueueCard({
  queue,
}: Readonly<{ queue: VendorPaymentDraftQueue }>) {
  const { rows, levelCounts, vendorCounts, totalDocuments, totalAmount, totalLabel } = queue

  return (
    <ReportCardShell
      label={QUEUE_TITLE}
      title={QUEUE_TITLE}
      summary={
        <>
          {formatNumber(levelCounts.mengendap)}{" "}
          {VENDOR_PAYMENT_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()} ·{" "}
          {formatNumber(levelCounts.menunggu)}{" "}
          {VENDOR_PAYMENT_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()} ·{" "}
          {formatNumber(totalDocuments)} pembayaran draft — {formatCurrency(totalAmount)}{" "}
          {totalLabel}
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Tidak ada pembayaran vendor draft."
      notice={VENDOR_PAYMENT_DRAFT_NOTICE_TEXT}
    >
      <div className="flex flex-col gap-4">
        <ul
          aria-label="Rekap tingkat antrean pembayaran vendor draft"
          className="flex flex-wrap gap-1.5"
        >
          {VENDOR_PAYMENT_DRAFT_LEVELS.map((level) => (
            <li key={level}>
              <StatusChip
                status={level}
                customLabel={`${VENDOR_PAYMENT_DRAFT_LEVEL_LABELS[level]}: ${formatNumber(levelCounts[level])}`}
                customTone={LEVEL_TONES[level]}
              />
            </li>
          ))}
        </ul>
        {vendorCounts.length > 0 ? (
          <ul
            aria-label="Rekap vendor antrean pembayaran vendor draft"
            className="flex flex-wrap gap-1.5"
          >
            {vendorCounts.map((entry) => (
              <li key={entry.vendorId}>
                <StatusChip
                  status={entry.vendorName}
                  customLabel={`${entry.vendorName}: ${formatNumber(entry.total)} pembayaran draft (${formatNumber(entry.levelCounts.mengendap)} ${VENDOR_PAYMENT_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()}, ${formatNumber(entry.levelCounts.menunggu)} ${VENDOR_PAYMENT_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()}) — ${formatCurrency(entry.totalAmount)} ${totalLabel}`}
                  customTone="default"
                />
              </li>
            ))}
          </ul>
        ) : null}
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.age}</DetailTableTh>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.documentNo}</DetailTableTh>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.vendor}</DetailTableTh>
            <DetailTableTh align="right">{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.amount}</DetailTableTh>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.paymentDate}</DetailTableTh>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.vendorBill}</DetailTableTh>
            <DetailTableTh>{VENDOR_PAYMENT_DRAFT_COLUMN_LABELS.createdBy}</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.vendorPaymentId}>
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
                    href={entityHref("/pembelian/pembayaran-vendor", {
                      id: row.vendorPaymentId,
                      slug: row.slug,
                    })}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                  >
                    {row.documentNo}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.vendorName}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
                <DetailTableTd>
                  {formatDate(row.paymentDate)}
                  {row.paymentDateLampau ? (
                    <span className="block text-xs text-muted-foreground">
                      Tanggal rencana bayar sudah lewat
                    </span>
                  ) : null}
                </DetailTableTd>
                <DetailTableTd>{row.vendorBillDocumentNo ?? "—"}</DetailTableTd>
                <DetailTableTd>{row.createdByName ?? "—"}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
