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
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { BoxArchive } from "@/components/ui/fontawesome-icons"

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
      className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono tabular-nums text-muted-foreground">
            {totalDocuments} dokumen — {formatCurrencyExact(totalGrandTotal)}{" "}
            {SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT}
          </p>
        </div>
      </div>
      <div className="p-4 px-5">
        <ul aria-label="Rekap tingkat antrean pesanan draft" className="flex flex-wrap gap-1.5">
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
        <div className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
            {SALES_ORDER_DRAFT_NOTICE_TEXT}
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <BoxArchive className="size-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Belum ada pesanan penjualan draft
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
                    <DetailTableTd className="font-medium text-foreground">{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="font-mono text-xs font-medium text-primary hover:underline tabular-nums"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.salesEmployeeName ?? "—"}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(row.date)}
                    </DetailTableTd>
                    <DetailTableTd className="font-mono text-xs tabular-nums">
                      {`${row.umurDraftHari} hari`}
                    </DetailTableTd>
                    <DetailTableTd className="text-xs">
                      {row.punyaJanji && row.deliveryDate
                        ? formatDate(row.deliveryDate)
                        : SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT}
                    </DetailTableTd>
                    <DetailTableTd>{row.asalLabel}</DetailTableTd>
                    <DetailTableTd align="right" className="font-mono font-semibold tabular-nums text-foreground">
                      {formatCurrencyExact(row.grandTotal)}
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
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
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
