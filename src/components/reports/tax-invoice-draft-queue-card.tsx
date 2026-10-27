import type {
  TaxInvoiceDraftLevel,
  TaxInvoiceDraftQueue,
  TaxInvoiceDraftRow,
} from "@/lib/reports/tax-invoice-draft-queue"
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

const LEVEL_TONES: Record<TaxInvoiceDraftLevel, "danger" | "warning"> = {
  mengendap: "danger",
  menunggu: "warning",
}

function DraftTable({
  rows,
  showCreditStatus,
}: Readonly<{ rows: TaxInvoiceDraftRow[]; showCreditStatus: boolean }>) {
  return (
    <div className="overflow-x-auto">
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Nomor Faktur</DetailTableTh>
          <DetailTableTh>Kode Transaksi</DetailTableTh>
          <DetailTableTh>Lawan Transaksi</DetailTableTh>
          <DetailTableTh>Tanggal Faktur</DetailTableTh>
          <DetailTableTh>Masa Pajak</DetailTableTh>
          <DetailTableTh align="right">DPP</DetailTableTh>
          <DetailTableTh align="right">Tarif</DetailTableTh>
          <DetailTableTh align="right">PPN</DetailTableTh>
          {showCreditStatus ? <DetailTableTh>Status Kredit</DetailTableTh> : null}
          <DetailTableTh>Tingkat</DetailTableTh>
          <DetailTableTh align="right">Umur</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.taxInvoiceId}>
              <DetailTableTd>
                <span className="font-medium text-foreground">{row.taxInvoiceNumber}</span>
                {row.replacesId !== null ? (
                  <span className="block text-xs text-muted-foreground">
                    Pengganti faktur #{row.replacesId}
                  </span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>{row.transactionCode}</DetailTableTd>
              <DetailTableTd>
                {row.counterpartyName ?? (
                  <span className="text-muted-foreground">Belum ada lawan tercatat</span>
                )}
              </DetailTableTd>
              <DetailTableTd>{formatDate(row.taxInvoiceDate)}</DetailTableTd>
              <DetailTableTd>
                {row.taxPeriod}
                {row.pastPeriodLabel ? (
                  <span className="block text-xs text-muted-foreground">{row.pastPeriodLabel}</span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(Number(row.dpp))}</DetailTableTd>
              <DetailTableTd align="right">{String(row.taxRate)}%</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(Number(row.taxAmount))}</DetailTableTd>
              {showCreditStatus ? (
                <DetailTableTd>
                  {row.creditStatus ?? (
                    <span className="text-muted-foreground">Belum ada status kredit tercatat</span>
                  )}
                </DetailTableTd>
              ) : null}
              <DetailTableTd>
                <StatusChip
                  status={row.level}
                  customLabel={row.levelLabel}
                  customTone={LEVEL_TONES[row.level]}
                />
              </DetailTableTd>
              <DetailTableTd align="right">{row.ageDays} hari</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}

/**
 * Antrean Faktur Pajak Draft (F-2026-10-27-098-S, penempatan Q-TIQ-7).
 *
 * Seluruh kata, ember arah, tingkat, umur, dan nominal verbatim payload
 * `buildTaxInvoiceDraftQueue` — UI tidak menghitung ulang (AC-TIQ-F1).
 * Dua ember Keluaran/Masukan tampil terpisah terhitung (BR-TIQ-02).
 * Baca-saja: nol tombol Terbit/Ganti/Batal/Kredit/Ekspor/Unggah (AC-TIQ-F3);
 * payload sensitif xmlPayload/xmlHash/djpMessage tidak pernah dirender
 * (AC-TIQ-F2).
 */
export function TaxInvoiceDraftQueueCard({ queue }: Readonly<{ queue: TaxInvoiceDraftQueue }>) {
  const outRows = queue.rows.filter((row) => row.direction === "out")
  const inRows = queue.rows.filter((row) => row.direction === "in")

  return (
    <section
      aria-label={queue.title}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{queue.title}</h2>
        <p className="text-xs text-muted-foreground">
          {queue.totalDocuments} dokumen · Keluaran {queue.directionCounts.out} · Masukan{" "}
          {queue.directionCounts.in} · Mengendap {queue.levelCounts.mengendap} · Menunggu{" "}
          {queue.levelCounts.menunggu} · Masa berjalan {queue.currentPeriod}
        </p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada faktur pajak yang masih draft
          </p>
        ) : (
          <>
            <section aria-label="Keluaran" className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Keluaran ({queue.directionCounts.out})
              </h3>
              {outRows.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Belum ada faktur pajak keluaran yang masih draft
                </p>
              ) : (
                <DraftTable rows={outRows} showCreditStatus={false} />
              )}
            </section>
            <section aria-label="Masukan" className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">
                Masukan ({queue.directionCounts.in})
              </h3>
              {inRows.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Belum ada faktur pajak masukan yang masih draft
                </p>
              ) : (
                <DraftTable rows={inRows} showCreditStatus />
              )}
            </section>
          </>
        )}
      </div>
    </section>
  )
}
