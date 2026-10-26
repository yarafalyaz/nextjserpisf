import Link from "next/link"
import {
  SALES_ORDER_DRAFT_AGE_COLUMN_TEXT,
  SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT,
  SALES_ORDER_DRAFT_LEVEL_LABELS,
  SALES_ORDER_DRAFT_LEVELS,
  SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT,
  SALES_ORDER_DRAFT_NOTICE_TEXT,
  SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT,
  SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  type SalesOrderDraftLevel,
  type SalesOrderDraftRow,
} from "@/lib/reports/sales-order-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
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

const LEVEL_TONES: Record<SalesOrderDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

/**
 * F-2026-10-26-056-S (056-F): antrean pesanan penjualan draft mengendap.
 *
 * Data loader read-only `getSalesOrderDraftQueue` — tingkat, label tingkat,
 * umur draft, penanda janji, asal, dan rekap ditampilkan apa adanya; UI
 * tidak menghitung ulang dan tidak mengurut ulang (Q-SOQ-3/4). Judul,
 * notice, label kolom, dan label rekap verbatim konstanta builder.
 * Penjual null tampil `—`; tanpa janji tampil penanda builder. Tanpa
 * tombol Setujui/Batal/Kirim di antrean: tindak-lanjut lewat detail
 * pesanan existing.
 */
export function SalesOrderDraftQueueCard({
  rows,
  levelCounts,
  totalDocuments,
  totalGrandTotal,
}: Readonly<{
  rows: SalesOrderDraftRow[]
  levelCounts: Record<SalesOrderDraftLevel, number>
  totalDocuments: number
  totalGrandTotal: number
}>) {
  const title = SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT
  return (
    <section
      aria-label={title}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {totalDocuments} dokumen — {formatCurrency(totalGrandTotal)}{" "}
          {SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT}
        </p>
        <ul aria-label="Rekap tingkat antrean pesanan draft" className="mt-2 flex flex-wrap gap-1.5">
          {SALES_ORDER_DRAFT_LEVELS.map((level) => (
            <li key={level}>
              <StatusChip
                status={level}
                customLabel={`${SALES_ORDER_DRAFT_LEVEL_LABELS[level]}: ${levelCounts[level]}`}
                customTone={LEVEL_TONES[level]}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{SALES_ORDER_DRAFT_NOTICE_TEXT}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada pesanan penjualan draft
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Pesanan</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>{SALES_ORDER_DRAFT_AGE_COLUMN_TEXT}</DetailTableTh>
                <DetailTableTh>{SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT}</DetailTableTh>
                <DetailTableTh>Asal</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tingkat</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => (
                  <DetailTableRow key={row.salesOrderId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.salesEmployeeName ?? "—"}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd>{`${row.umurDraftHari} hari`}</DetailTableTd>
                    <DetailTableTd>
                      {row.punyaJanji && row.deliveryDate
                        ? formatDate(row.deliveryDate)
                        : SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT}
                    </DetailTableTd>
                    <DetailTableTd>{row.asalLabel}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(row.grandTotal)}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.tingkat}
                        customLabel={row.tingkatLabel}
                        customTone={LEVEL_TONES[row.tingkat]}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        Buka Pesanan
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
