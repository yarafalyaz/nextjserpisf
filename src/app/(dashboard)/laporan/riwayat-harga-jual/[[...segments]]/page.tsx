export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
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
import { EmptyState } from "@/components/ui/empty-state"
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
import { getSalesPriceHistory } from "@/lib/reports/sales-price-history-data"
import {
  SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR,
  SALES_PRICE_HISTORY_MAX_PERIOD_DAYS,
  type SalesPriceEvent,
  type SalesPriceHistory,
} from "@/lib/reports/sales-price-history"

export const metadata: Metadata = { title: "Riwayat Harga Jual" }

/**
 * Laporan Riwayat Harga Jual (F-2026-10-25-028-S tahap 1): harga satuan
 * aktual per pasangan pelanggan×barang dari baris faktur diakui — BUKAN
 * riwayat harga penawaran 039-S; populasi kedua spec dilarang digabung.
 *
 * Konsumen verbatim loader `getSalesPriceHistory`: notice, harga terakhir
 * (= kejadian[0] server), qty kumulatif, dan label sumber harga ditempel
 * apa adanya; UI tidak menghitung/mengagregat ulang (BR-PH-02/05/06).
 * Diskon baris tampil terpisah dari harga satuan. Baris tanpa barang hanya
 * hitungan ember BARIS_TANPA_BARANG. Pelanggan wajib dipilih — tanpa
 * pilihan loader tidak dipanggil (BR-PH-08). Izin `view_reports` di page
 * + loader fail-closed; tautan faktur hanya bila `view_sales_invoices`.
 * Baca-saja tahap 1: tanpa ekspor/PDF server-side (pola 039-S BR-QPH-09).
 */
export default async function SalesPriceHistoryPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")
  const canViewInvoices = await hasPermission("view_sales_invoices")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const { periodSlug, filters } = splitReportSegments(segments)

  const now = new Date()
  const period = parseReportPeriod(periodSlug, {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  })

  const customerKey = filters.pelanggan ?? search.customerId ?? null
  const itemKey = filters.barang ?? null

  const selection = await loadPriceHistorySelection(customerKey, itemKey)
  const { selectedCustomer, selectedItem } = selection

  let history: SalesPriceHistory | null = null
  let loadError: string | null = null
  if (selectedCustomer) {
    try {
      history = await getSalesPriceHistory({
        customerId: selectedCustomer.id,
        periodeMulai: period.start,
        periodeSelesai: period.end,
        itemId: selectedItem?.id ?? null,
      })
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Riwayat harga jual tidak dapat dimuat."
    }
  }

  const periodLabel = formatPeriodLabel(period)
  const renderEventDoc = (event: SalesPriceEvent) =>
    canViewInvoices ? (
      <Link
        href={event.tautanDetail}
        className="text-primary hover:underline"
        aria-label={`Lihat faktur ${event.documentNo}`}
      >
        {event.documentNo}
      </Link>
    ) : (
      event.documentNo
    )

  return (
    <ReportPageShell
      title="Riwayat Harga Jual"
      sheetTitle="Riwayat Harga Jual"
      subtitle="Harga Satuan Aktual per Pelanggan dan Barang dari Faktur"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/riwayat-harga-jual"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={priceHistorySelects(selection)}
        />
      }
      actions={<ExportButtons title="Riwayat Harga Jual" />}
    >
      {!selectedCustomer && (
        <p className="doc-lines">
          Pilih pelanggan untuk melihat riwayat harga jual pelanggan tersebut. Riwayat ini
          menampilkan harga satuan yang benar-benar tertagih pada faktur — bukan harga penawaran.
        </p>
      )}

      {loadError && (
        <p className="doc-lines" role="alert">
          {loadError} Periode maksimum {SALES_PRICE_HISTORY_MAX_PERIOD_DAYS} hari.
        </p>
      )}

      {history && (
        <>
          <p className="doc-lines">{history.notice}</p>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
            <ReportKpiCard label="Pasangan Pelanggan–Barang" value={String(history.jumlahPasangan)} />
            <ReportKpiCard label="Jumlah Transaksi" value={String(history.jumlahTransaksi)} />
            <PriceHistoryTruncatedKpi terpotong={history.terpotong} />
          </div>

          <ReportSection
            title="Harga Terakhir per Barang"
            description="Satu baris kejadian terbaru per pasangan pelanggan–barang dari server"
          >
            <DetailTable data-report-table="Harga Terakhir per Barang">
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>No. Faktur</DetailTableTh>
                <DetailTableTh>Sumber Harga</DetailTableTh>
                <DetailTableTh align="right">Harga Satuan Terakhir</DetailTableTh>
                <DetailTableTh align="right">Jumlah Transaksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {history.pasangan.map((pair) => (
                  <DetailTableRow key={`${pair.customerId}-${pair.itemId}`}>
                    <DetailTableTd>
                      <div className="font-medium">{pair.itemName ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{pair.itemSku ?? "—"}</div>
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(pair.transaksiTerakhir.date, { format: "short" })}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">
                      {renderEventDoc(pair.transaksiTerakhir)}
                    </DetailTableTd>
                    <DetailTableTd>{pair.transaksiTerakhir.priceSourceLabel}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(pair.transaksiTerakhir.unitPrice, { zeroDash: false })}
                      {pair.transaksiTerakhir.hargaNol ? " (harga 0)" : ""}
                    </DetailTableTd>
                    <DetailTableTd align="right">{pair.jumlahTransaksi}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {history.pasangan.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6">
                      <EmptyState title="Tidak ada transaksi harga jual untuk pelanggan ini pada periode dan saringan aktif." className="py-0" />
                    </DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          {history.pasangan.map((pair) => (
            <ReportSection
              key={`detail-${pair.customerId}-${pair.itemId}`}
              title={`Kejadian Harga — ${pair.itemName ?? "Barang"} (${pair.itemSku ?? "—"})`}
              description={`Qty kumulatif ${formatNumber(pair.qtyKumulatif, 2)} dari server`}
            >
              <DetailTable data-report-table={`Kejadian Harga ${pair.itemSku ?? pair.itemName ?? ""}`}>
                <DetailTableHead>
                  <DetailTableTh>Tanggal</DetailTableTh>
                  <DetailTableTh>No. Faktur</DetailTableTh>
                  <DetailTableTh>Sumber Harga</DetailTableTh>
                  <DetailTableTh align="right">Qty</DetailTableTh>
                  <DetailTableTh>Satuan</DetailTableTh>
                  <DetailTableTh align="right">Harga Satuan</DetailTableTh>
                  <DetailTableTh align="right">Diskon Baris</DetailTableTh>
                  <DetailTableTh align="right">Total Baris</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {pair.kejadian.map((event: SalesPriceEvent) => (
                    <DetailTableRow key={event.invoiceItemId}>
                      <DetailTableTd>{formatDate(event.date, { format: "short" })}</DetailTableTd>
                      <DetailTableTd className="font-mono text-xs">{renderEventDoc(event)}</DetailTableTd>
                      <DetailTableTd>{event.priceSourceLabel}</DetailTableTd>
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
                  jumlahTotal={pair.jumlahTransaksi}
                  maxPerPair={SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR}
                />
              )}
            </ReportSection>
          ))}

          <ReportSection
            title="Baris Faktur Tanpa Barang"
            description="Hanya hitungan ringkas per pelanggan — tanpa daftar baris"
          >
            <DetailTable data-report-table="Baris Faktur Tanpa Barang">
              <DetailTableHead>
                <DetailTableTh>Ember</DetailTableTh>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh align="right">Jumlah Baris</DetailTableTh>
                <DetailTableTh>Tanggal Terawal</DetailTableTh>
                <DetailTableTh>Tanggal Terbaru</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {history.tanpaBarang.map((row) => (
                  <DetailTableRow key={row.customerId}>
                    <DetailTableTd className="font-mono text-xs">{row.label}</DetailTableTd>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd align="right">{row.count}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.tanggalTerawal, { format: "short" })}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.tanggalTerbaru, { format: "short" })}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {history.tanpaBarang.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">
                      <EmptyState title="Tidak ada baris faktur tanpa barang pada periode dan saringan aktif." className="py-0" />
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
