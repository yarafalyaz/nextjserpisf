import Link from "next/link"
import {
  QUOTATION_DRAFT_NOTICE_TEXT,
  QUOTATION_DRAFT_STAGE_LABELS,
  QUOTATION_DRAFT_STAGES,
  type QuotationDraftRow,
  type QuotationDraftStage,
} from "@/lib/reports/quotation-draft-queue"
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

const STAGE_TONES: Record<
  QuotationDraftStage,
  "danger" | "warning" | "accent" | "default"
> = {
  LEWAT_BELUM_TERKIRIM: "danger",
  MENIPIS: "warning",
  TANPA_BATAS: "default",
  TERBUKA: "accent",
}


/**
 * F-2026-10-26-055-S (055-F): antrean draf penawaran basi belum terkirim.
 *
 * Data dari loader read-only `getQuotationDraftQueue` + filter builder
 * `filterQuotationDraftQueue` — tahap, label tahap, sisa hari, dan umur
 * draf ditampilkan apa adanya; UI tidak menghitung ulang (AC-QD-6/8).
 * Judul + notice + label verbatim konstanta/spec; penjual null tampil `—`
 * (Q-QD-5, tanpa fallback createdBy); sisaHari null tampil `—` (BR-QD-03).
 * Tanpa tombol kirim/hapus massal dan tanpa ekspor kontak (BR-QD-05/07):
 * tindak-lanjut lewat detail penawaran existing.
 */
export function QuotationDraftQueueCard({
  rows,
  stageCounts,
  totalDocuments,
  mode,
}: Readonly<{
  /** Baris sesudah filter builder untuk mode aktif. */
  rows: QuotationDraftRow[]
  /** Rekap tahap atas populasi penuh dari loader (AC-QD-8). */
  stageCounts: Record<QuotationDraftStage, number>
  totalDocuments: number
  mode: "default" | "semua"
}>) {
  return (
    <section
      aria-label="Draf Penawaran Basi"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Draf Penawaran Basi
        </h2>
        <nav aria-label="Filter tahap antrean draf" className="flex items-center gap-1">
          <Link
            href="/penjualan/antrean-penawaran-draf"
            aria-current={mode === "default" ? "page" : undefined}
            className={`filter-chip ${mode === "default" ? "active" : ""}`}
          >
            Perlu Tindak
          </Link>
          <Link
            href="/penjualan/antrean-penawaran-draf?tampilan=semua"
            aria-current={mode === "semua" ? "page" : undefined}
            className={`filter-chip ${mode === "semua" ? "active" : ""}`}
          >
            Semua
          </Link>
        </nav>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {totalDocuments} draf penawaran belum terkirim
        </p>
        <ul aria-label="Rekap tahap draf" className="mt-2 flex flex-wrap gap-1.5">
          {QUOTATION_DRAFT_STAGES.map((stage) => (
            <li key={stage}>
              <StatusChip
                status={stage}
                customLabel={`${QUOTATION_DRAFT_STAGE_LABELS[stage]}: ${stageCounts[stage]}`}
                customTone={STAGE_TONES[stage]}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {QUOTATION_DRAFT_NOTICE_TEXT}
        </p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {mode === "semua"
              ? "Belum ada draf penawaran"
              : "Belum ada draf penawaran yang perlu ditindak"}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Penawaran</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Masa Berlaku</DetailTableTh>
                <DetailTableTh align="right">Sisa Hari</DetailTableTh>
                <DetailTableTh align="right">Umur Draf</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tahap</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => (
                  <DetailTableRow key={row.quotationId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/penawaran", {
                          id: row.quotationId,
                          slug: row.slug,
                        })}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.salesEmployeeName ?? "—"}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd>
                      {row.validUntil ? formatDate(row.validUntil) : "—"}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {row.sisaHari === null ? "—" : `${row.sisaHari} hari`}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {`${row.umurDrafHari} hari`}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(row.grandTotal)}
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.tahap}
                        customLabel={row.tahapLabel}
                        customTone={STAGE_TONES[row.tahap]}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/penawaran", {
                          id: row.quotationId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        Buka Penawaran
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
