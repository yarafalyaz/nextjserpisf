import Link from "next/link"
import type {
  QuotationFollowUpRow,
  QuotationFollowUpStage,
} from "@/lib/reports/quotation-followup-queue"
import { QUOTATION_FOLLOWUP_NOTICE_TEXT } from "@/lib/reports/quotation-followup-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import { buildWhatsappMessage } from "@/lib/utils/whatsapp"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { WhatsappButton } from "./whatsapp-button"
import { QuotationFollowUpExportButton } from "./quotation-followup-export-button"
import {
  QuotationDocumentCell,
  QuotationGrandTotalCell,
  QuotationRemainingDaysCell,
  QuotationSalesCell,
  QuotationStageCell,
  QuotationValidUntilCell,
} from "./quotation-queue-cells"

const STAGE_TONES: Record<
  QuotationFollowUpStage,
  "danger" | "warning" | "accent" | "default"
> = {
  KEDALUWARSA: "danger",
  MENIPIS: "warning",
  TERBUKA: "accent",
  TANPA_BATAS: "default",
}

/**
 * F-2026-10-22-091-S: antrean penawaran terkirim belum dijawab.
 *
 * Data dari loader read-only `getQuotationFollowUpQueue` + filter builder
 * `filterQuotationFollowUpQueue` — tahap, label tahap, dan sisa hari
 * ditampilkan apa adanya; UI tidak menghitung ulang (AC-QF-10). Kata
 * kolom/tombol/notice verbatim spec §6. Tanpa tombol terima/konversi/
 * diskon: tindakan itu tetap lewat detail penawaran existing (BR-QF-11).
 * Klik WhatsApp hanya membuka tautan dan tercatat sebagai klik
 * (WhatsappButton existing, pola F-036) — bukan tindak lanjut (BR-QF-06).
 */
export function QuotationFollowUpQueueCard({
  rows,
  mode,
  csv,
}: Readonly<{
  rows: QuotationFollowUpRow[]
  mode: "default" | "semua"
  /** CSV tanpa kolom kontak (Q-QF-4), dibangun server. */
  csv: string
}>) {
  return (
    <section
      aria-label="Antrean Penawaran Belum Dijawab"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Antrean Penawaran Belum Dijawab
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Filter tahap antrean" className="flex items-center gap-1">
            <Link
              href="/penjualan/antrean-penawaran"
              aria-current={mode === "default" ? "page" : undefined}
              className={`filter-chip ${mode === "default" ? "active" : ""}`}
            >
              Perlu dikejar
            </Link>
            <Link
              href="/penjualan/antrean-penawaran?tampilan=semua"
              aria-current={mode === "semua" ? "page" : undefined}
              className={`filter-chip ${mode === "semua" ? "active" : ""}`}
            >
              Semua
            </Link>
          </nav>
          <QuotationFollowUpExportButton csv={csv} disabled={rows.length === 0} />
        </div>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {rows.length} penawaran terkirim belum dijawab
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {QUOTATION_FOLLOWUP_NOTICE_TEXT}
        </p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {mode === "semua"
              ? "Belum ada penawaran terkirim yang belum dijawab"
              : "Belum ada penawaran yang perlu dikejar"}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Penawaran</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Terkirim</DetailTableTh>
                <DetailTableTh>Masa Berlaku</DetailTableTh>
                <DetailTableTh align="right">Sisa Hari</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tahap</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => (
                  <DetailTableRow key={row.quotationId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <QuotationDocumentCell
                      quotationId={row.quotationId}
                      slug={row.slug}
                      documentNo={row.documentNo}
                    />
                    <QuotationSalesCell salesEmployeeName={row.salesEmployeeName} />
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <QuotationValidUntilCell validUntil={row.validUntil} />
                    <QuotationRemainingDaysCell sisaHari={row.sisaHari} />
                    <QuotationGrandTotalCell grandTotal={row.grandTotal} />
                    <QuotationStageCell
                      tahap={row.tahap}
                      tahapLabel={row.tahapLabel}
                      tone={STAGE_TONES[row.tahap]}
                    />
                    <DetailTableTd>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={entityHref("/penjualan/penawaran", {
                            id: row.quotationId,
                            slug: row.slug,
                          })}
                          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                        >
                          Buka Penawaran
                        </Link>
                        {row.phone ? (
                          <WhatsappButton
                            phone={row.phone}
                            modelType="Quotation"
                            modelId={row.quotationId}
                            surface="queue"
                            message={buildWhatsappMessage({
                              customerName: row.customerName,
                              documentLabel: "Penawaran",
                              documentNo: row.documentNo,
                              status: "sent",
                            })}
                          />
                        ) : null}
                      </div>
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
