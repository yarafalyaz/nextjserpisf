export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccounting, formatDate, formatNumber } from "@/lib/utils/format"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportKpiCard, ReportSection } from "@/components/reports/report-section"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { StatusChip } from "@/components/ui/status-chip"
import {
  formatPeriodLabel,
  parseReportPeriod,
  splitReportSegments,
} from "@/lib/reports/report-period"
import {
  loadPriceHistorySelection,
  priceHistorySelects,
  PriceHistoryTruncatedKpi,
  PriceHistoryTruncatedNote,
} from "@/app/(dashboard)/laporan/_components/price-history-shared"
import { getQuotationPriceHistory } from "@/lib/reports/quotation-price-history-data"
import {
  QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR,
  QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS,
  type QuotationPriceEvent,
  type QuotationPriceHistory,
} from "@/lib/reports/quotation-price-history"

export const metadata: Metadata = { title: "Riwayat Harga Penawaran" }

/**
 * Laporan Riwayat Harga Penawaran (F-2026-10-25-039-S, PUTUSAN Lead
 * PR #901 komentar 6399637522): halaman laporan baru terpisah di katalog
 * penjualan — BUKAN permukaan riwayat harga faktur 028-S.
 *
 * Konsumen verbatim loader `getQuotationPriceHistory`: notice BR-QPH-10,
 * label ember, dan penanda revisi berjalan ditempel apa adanya dari
 * server; UI tidak menghitung ulang (tanpa rata-rata/diskon efektif/
 * probabilitas, BR-QPH-05/06) dan tidak menyediakan tombol "pakai harga
 * ini"/auto-fill (BR-QPH-09). Tidak ada label harga berlaku/pasar.
 * Ember DRAFT hanya tampil bila sakelar eksplisit menyala (Q-QPH-4);
 * baris tanpa barang hanya hitungan ringkas (Q-QPH-5). Pelanggan wajib
 * dipilih — tanpa pilihan loader tidak dipanggil sama sekali (BR-QPH-12).
 * Izin `view_reports` ditegakkan di page + loader fail-closed di server.
 */
export default async function QuotationPriceHistoryPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const { periodSlug, filters } = splitReportSegments(segments)

  const now = new Date()
  const period = parseReportPeriod(periodSlug, {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  })

  const customerKey = filters.pelanggan ?? search.customerId ?? null
  const itemKey = filters.barang ?? null
  const includeDraft = (filters.draft ?? search.includeDraft) === "1"

  const selection = await loadPriceHistorySelection(customerKey, itemKey)
  const { selectedCustomer, selectedItem } = selection

  let history: QuotationPriceHistory | null = null
  let loadError: string | null = null
  if (selectedCustomer) {
    try {
      history = await getQuotationPriceHistory({
        customerId: selectedCustomer.id,
        periodeMulai: period.start,
        periodeSelesai: period.end,
        includeDraft,
        itemId: selectedItem?.id ?? null,
      })
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : "Riwayat harga penawaran tidak dapat dimuat."
    }
  }

  const periodLabel = formatPeriodLabel(period)

  return (
    <ReportPageShell
      title="Riwayat Harga Penawaran"
      sheetTitle="Riwayat Harga Penawaran"
      subtitle="Harga yang Pernah Ditawarkan per Pelanggan dan Barang"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/riwayat-harga-penawaran"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={priceHistorySelects(selection)}
          toggle={{
            param: "draft",
            label: "Sertakan Draft",
            checked: includeDraft,
          }}
        />
      }
      actions={<ExportButtons title="Riwayat Harga Penawaran" />}
    >
      {!selectedCustomer && (
        <p className="doc-lines">
          Pilih pelanggan untuk melihat riwayat harga penawaran pelanggan tersebut. Riwayat ini
          menampilkan harga yang pernah ditawarkan pada penawaran — bukan harga transaksi.
        </p>
      )}

      {loadError && (
        <p className="doc-lines" role="alert">
          {loadError} Periode maksimum {QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS} hari.
        </p>
      )}

      {history && (
        <>
          <p className="doc-lines">{history.notice}</p>
          <p className="doc-lines">
            {history.revisiBerjalanLabel} — harga dari baris penawaran yang sedang berjalan;
            {history.menyertakanDraft
              ? " saringan draft menyala."
              : " draft tidak disertakan."}
          </p>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
            <ReportKpiCard label="Pasangan Pelanggan–Barang" value={String(history.jumlahPasangan)} />
            <ReportKpiCard label="Jumlah Kejadian Penawaran" value={String(history.jumlahKejadian)} />
            <PriceHistoryTruncatedKpi terpotong={history.terpotong} />
          </div>

          <ReportSection
            title="Penawaran Terakhir per Barang"
            description="Satu baris kejadian terbaru per pasangan pelanggan–barang dari server"
          >
            <DetailTable data-report-table="Penawaran Terakhir per Barang">
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>No. Penawaran</DetailTableTh>
                <DetailTableTh>Ember Status</DetailTableTh>
                <DetailTableTh align="right">Harga Satuan Ditawarkan</DetailTableTh>
                <DetailTableTh align="right">Jumlah Kejadian</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {history.pasangan.map((pair) => (
                  <DetailTableRow key={`${pair.customerId}-${pair.itemId}`}>
                    <DetailTableTd>
                      <div className="font-medium">{pair.itemName ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{pair.itemSku ?? "—"}</div>
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(pair.penawaranTerakhir.date, { format: "short" })}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">
                      <Link
                        href={pair.penawaranTerakhir.tautanDetail}
                        className="text-primary hover:underline"
                        aria-label={`Lihat penawaran ${pair.penawaranTerakhir.documentNo}`}
                      >
                        {pair.penawaranTerakhir.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={pair.penawaranTerakhir.emberStatus}
                        customLabel={pair.penawaranTerakhir.emberLabel}
                      />
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(pair.penawaranTerakhir.unitPrice, { zeroDash: false })}
                      {pair.penawaranTerakhir.hargaNol ? " (harga 0)" : ""}
                    </DetailTableTd>
                    <DetailTableTd align="right">{pair.jumlahKejadian}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {history.pasangan.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6">
                      Tidak ada penawaran untuk pelanggan ini pada periode dan saringan aktif.
                    </DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          {history.pasangan.map((pair) => (
            <ReportSection
              key={`detail-${pair.customerId}-${pair.itemId}`}
              title={`Kejadian Penawaran — ${pair.itemName ?? "Barang"} (${pair.itemSku ?? "—"})`}
              description={pair.hitunganPerEmber
                .map((bucket) => `${bucket.label}: ${bucket.count}`)
                .join(" · ")}
            >
              <DetailTable data-report-table={`Kejadian Penawaran ${pair.itemSku ?? pair.itemName ?? ""}`}>
                <DetailTableHead>
                  <DetailTableTh>Tanggal</DetailTableTh>
                  <DetailTableTh>No. Penawaran</DetailTableTh>
                  <DetailTableTh>Ember Status</DetailTableTh>
                  <DetailTableTh align="right">Qty</DetailTableTh>
                  <DetailTableTh>Satuan</DetailTableTh>
                  <DetailTableTh align="right">Harga Satuan Ditawarkan</DetailTableTh>
                  <DetailTableTh align="right">Diskon Baris</DetailTableTh>
                  <DetailTableTh align="right">Total Baris</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {pair.kejadian.map((event: QuotationPriceEvent) => (
                    <DetailTableRow key={event.quotationItemId}>
                      <DetailTableTd>{formatDate(event.date, { format: "short" })}</DetailTableTd>
                      <DetailTableTd className="font-mono text-xs">
                        <Link
                          href={event.tautanDetail}
                          className="text-primary hover:underline"
                          aria-label={`Lihat penawaran ${event.documentNo}`}
                        >
                          {event.documentNo}
                        </Link>{" "}
                        <span className="text-muted-foreground">Rev. {event.revisionNumber}</span>
                      </DetailTableTd>
                      <DetailTableTd>
                        <StatusChip status={event.emberStatus} customLabel={event.emberLabel} />
                        {event.statusTidakDikenal ? (
                          <span className="text-muted-foreground"> ({event.status})</span>
                        ) : null}
                        {event.kedaluwarsaTurunan ? (
                          <span className="text-muted-foreground"> (turunan dari tanggal berlaku)</span>
                        ) : null}
                      </DetailTableTd>
                      <DetailTableTd align="right">{formatNumber(event.qty, 2)}</DetailTableTd>
                      <DetailTableTd>{event.uom ?? "—"}</DetailTableTd>
                      <DetailTableTd align="right">
                        {formatAccounting(event.unitPrice, { zeroDash: false })}
                        {event.hargaNol ? " (harga 0)" : ""}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {formatAccounting(event.discount, { zeroDash: false })}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {formatAccounting(event.total, { zeroDash: false })}
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
              {pair.terpotong && (
                <PriceHistoryTruncatedNote
                  jumlahTampil={pair.jumlahTampil}
                  jumlahTotal={pair.jumlahKejadian}
                  maxPerPair={QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR}
                />
              )}
            </ReportSection>
          ))}

          <ReportSection
            title="Baris Penawaran Tanpa Barang"
            description="Hanya hitungan ringkas per pelanggan — tanpa daftar baris"
          >
            <DetailTable data-report-table="Baris Penawaran Tanpa Barang">
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh align="right">Jumlah Baris</DetailTableTh>
                <DetailTableTh>Tanggal Terawal</DetailTableTh>
                <DetailTableTh>Tanggal Terbaru</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {history.tanpaBarang.map((row) => (
                  <DetailTableRow key={row.customerId}>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd align="right">{row.count}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.tanggalTerawal, { format: "short" })}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.tanggalTerbaru, { format: "short" })}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {history.tanpaBarang.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6">
                      Tidak ada baris penawaran tanpa barang pada periode dan saringan aktif.
                    </DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>
        </>
      )}
    </ReportPageShell>
  )
}
