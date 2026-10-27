import Link from "next/link"
import {
  PURCHASE_ORDER_DRAFT_COLUMN_LABELS,
  PURCHASE_ORDER_DRAFT_LEVEL_LABELS,
  PURCHASE_ORDER_DRAFT_LEVELS,
  PURCHASE_ORDER_DRAFT_NOTICE_TEXT,
  PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT,
  PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT,
  type PurchaseOrderDraftLevel,
  type PurchaseOrderDraftQueue,
} from "@/lib/reports/purchase-order-draft-queue"
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

const LEVEL_TONES: Record<PurchaseOrderDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

/**
 * 060-F (F-2026-10-26-060-S tahap 1, AC-POQ-F1..F3): antrean pesanan
 * pembelian draft mengendap. Komponen murni presentasi atas
 * `PurchaseOrderDraftQueue` dari loader server (`getPurchaseOrderDraftQueue`,
 * Backend PR #1110 merged): kolom, label tingkat, notice, dan rekap ditempel
 * verbatim payload/konstanta server — UI TIDAK menghitung umur/tingkat/Σ
 * grandTotal dan tidak mengurut ulang. Setiap Σ grandTotal berlabel
 * `totalLabel` server ("nilai draft belum disetujui"); draft TIDAK berlabel
 * utang/komitmen bayar. Vendor/pembuat null tampil `—`. Tanpa expectedDate
 * tampil konstanta server; expectedDate lampau TANPA kata terlambat/jatuh
 * tempo (BR-POQ-04). Tautan baris hanya ke detail pesanan existing; nol
 * tombol Setujui/Batal/Hapus/Kirim (BR-POQ-07).
 */
export function PurchaseOrderDraftQueueCard({
  queue,
}: Readonly<{ queue: PurchaseOrderDraftQueue }>) {
  const { rows, levelCounts, totalDocuments, totalGrandTotal, totalLabel } = queue

  return (
    <ReportCardShell
      label={PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT}
      title={PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT}
      summary={
        <>
          {formatNumber(levelCounts.mengendap)}{" "}
          {PURCHASE_ORDER_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()} ·{" "}
          {formatNumber(levelCounts.menunggu)}{" "}
          {PURCHASE_ORDER_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()} ·{" "}
          {formatNumber(totalDocuments)} pesanan draft — {formatCurrency(totalGrandTotal)}{" "}
          {totalLabel}
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Tidak ada pesanan pembelian Draf."
      notice={PURCHASE_ORDER_DRAFT_NOTICE_TEXT}
    >
      <div className="flex flex-col gap-4">
        <ul
          aria-label="Rekap tingkat antrean pesanan pembelian draft"
          className="flex flex-wrap gap-1.5"
        >
          {PURCHASE_ORDER_DRAFT_LEVELS.map((level) => (
            <li key={level}>
              <StatusChip
                status={level}
                customLabel={`${PURCHASE_ORDER_DRAFT_LEVEL_LABELS[level]}: ${formatNumber(levelCounts[level])}`}
                customTone={LEVEL_TONES[level]}
              />
            </li>
          ))}
        </ul>
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.age}</DetailTableTh>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.documentNo}</DetailTableTh>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.vendor}</DetailTableTh>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.source}</DetailTableTh>
            <DetailTableTh align="right">{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.value}</DetailTableTh>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.expectedDate}</DetailTableTh>
            <DetailTableTh>{PURCHASE_ORDER_DRAFT_COLUMN_LABELS.createdBy}</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.purchaseOrderId}>
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
                    href={entityHref("/pembelian/pesanan", {
                      id: row.purchaseOrderId,
                      slug: row.slug,
                    })}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                  >
                    {row.documentNo}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.vendorName ?? "—"}</DetailTableTd>
                <DetailTableTd>{row.sumberLabel}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(row.grandTotal)}</DetailTableTd>
                <DetailTableTd>
                  {row.punyaRencanaTerima && row.expectedDate
                    ? formatDate(row.expectedDate)
                    : PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT}
                </DetailTableTd>
                <DetailTableTd>{row.createdByName ?? "—"}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
