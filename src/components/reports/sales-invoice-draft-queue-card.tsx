import Link from "next/link"
import {
  SALES_INVOICE_DRAFT_COLUMN_LABELS,
  SALES_INVOICE_DRAFT_LEVELS,
  SALES_INVOICE_DRAFT_NO_DUE_DATE_TEXT,
  type SalesInvoiceDraftLevel,
  type SalesInvoiceDraftRow,
  type SalesInvoiceDraftSummary,
} from "@/lib/reports/sales-invoice-draft-queue"
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

const LEVEL_TONES: Record<SalesInvoiceDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

const TITLE = "Faktur Draf Mengendap"

/**
 * F-2026-10-26-057-S (057-F): antrean faktur penjualan draft mengendap.
 *
 * Data loader read-only `getSalesInvoiceDraftQueue` — tingkat, label
 * tingkat, umur draft, penanda rencana jatuh tempo, sumber, dan rekap
 * ditampilkan apa adanya; UI tidak menghitung ulang dan tidak mengurut
 * ulang (Q-SIQ-2/4). `dueDate` lampau TIDAK PERNAH berlabel jatuh tempo/
 * piutang (BR-SIQ-04): terisi → tanggal, kosong → penanda builder.
 * Penjual null tampil `—`. Tanpa tombol Posting/Batal/Tagih di antrean:
 * tindak-lanjut lewat detail faktur existing.
 */
export function SalesInvoiceDraftQueueCard({
  rows,
  summary,
  noticeText,
  levelLabels,
}: Readonly<{
  rows: SalesInvoiceDraftRow[]
  summary: SalesInvoiceDraftSummary
  noticeText: string
  levelLabels: Record<SalesInvoiceDraftLevel, string>
}>) {
  const levelCounts: Record<SalesInvoiceDraftLevel, number> = {
    mengendap: summary.mengendapCount,
    menunggu: summary.menungguCount,
  }
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {summary.totalDocuments} dokumen — {formatCurrency(summary.totalGrandTotal)}{" "}
          {summary.totalLabel}
        </p>
        <ul aria-label="Rekap tingkat antrean faktur draft" className="mt-2 flex flex-wrap gap-1.5">
          {SALES_INVOICE_DRAFT_LEVELS.map((level) => (
            <li key={level}>
              <StatusChip
                status={level}
                customLabel={`${levelLabels[level]}: ${levelCounts[level]}`}
                customTone={LEVEL_TONES[level]}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{noticeText}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada faktur penjualan draft
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Faktur</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>{SALES_INVOICE_DRAFT_COLUMN_LABELS.umur}</DetailTableTh>
                <DetailTableTh>{SALES_INVOICE_DRAFT_COLUMN_LABELS.dueDate}</DetailTableTh>
                <DetailTableTh>{SALES_INVOICE_DRAFT_COLUMN_LABELS.sumber}</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tingkat</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => (
                  <DetailTableRow key={row.invoiceId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/faktur", {
                          id: row.invoiceId,
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
                      {row.punyaRencanaJatuhTempo && row.dueDate
                        ? formatDate(row.dueDate)
                        : SALES_INVOICE_DRAFT_NO_DUE_DATE_TEXT}
                    </DetailTableTd>
                    <DetailTableTd>{row.sumberLabel}</DetailTableTd>
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
                        href={entityHref("/penjualan/faktur", {
                          id: row.invoiceId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        Buka Faktur
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
