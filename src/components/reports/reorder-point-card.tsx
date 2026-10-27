import type { ReorderPointLine, ReorderPointResult } from "@/lib/reports/reorder-point"
import { formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * Kartu titik pesan-ulang (F-2026-10-25-048-S) di laporan stok minimum.
 *
 * Murni presentasi: semua angka, status, alasan, dan label konsumen
 * verbatim dari builder server `buildReorderPoints` (via loader
 * `loadReorderPoints`) — dilarang hitung ulang titik/saran/status di
 * sini. Ember `tidak_dinilai` tampil terhitung supaya daftar kosong
 * tidak terbaca "semua aman" (BR-ROP-05). `usageNote` persis server
 * ("tanpa laju"), `isCritical` label terpisah dari status (BR-ROP-06).
 * PO masuk per barang apa adanya dari server (PurchaseOrder tanpa
 * warehouseId) — bukan dialokasikan per gudang.
 *
 * Data mulai jendela laju diteruskan page sebagai props verbatim.
 */
const STATUS_LABELS: Record<ReorderPointLine["status"], string> = {
  pesan_sekarang: "Pesan sekarang",
  aman: "Aman",
  tidak_dinilai: "Tidak dinilai",
}

const NOT_ASSESSED_REASON_LABELS: Record<
  NonNullable<ReorderPointLine["notAssessedReason"]>,
  string
> = {
  tanpa_lapisan: "Tanpa lapisan stok di gudang",
  lead_time_kosong: "Lead time belum diisi",
  minimum_nol: "Minimum efektif 0",
}

export function ReorderPointCard({
  result,
  usageWindowDays,
  usageWindowStartLabel,
}: Readonly<{
  result: ReorderPointResult
  usageWindowDays: number
  usageWindowStartLabel: string
}>) {
  const { lines, counts } = result
  const summary = `${counts.assessed} dinilai · ${counts.orderNow} pesan sekarang · ${counts.critical} kritis · ${counts.notAssessed} tidak dinilai`
  return (
    <ReportCardShell
      label="Titik Pesan-Ulang"
      title="Titik Pesan-Ulang"
      summary={summary}
      isEmpty={lines.length === 0}
      emptyText="Belum ada pasangan barang-gudang yang dinilai"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Titik pesan-ulang = minimum efektif + kebutuhan selama lead time, memakai laju pakai{" "}
        {usageWindowDays} hari terakhir sejak {usageWindowStartLabel}. PO masuk dihitung per barang
        (bukan per gudang) apa adanya.
      </p>
      <div className="overflow-x-auto">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Barang</DetailTableTh>
            <DetailTableTh>Gudang</DetailTableTh>
            <DetailTableTh align="right">Stok gudang</DetailTableTh>
            <DetailTableTh align="right">Minimum</DetailTableTh>
            <DetailTableTh align="right">Lead time (hari)</DetailTableTh>
            <DetailTableTh align="right">Laju/hari</DetailTableTh>
            <DetailTableTh align="right">Titik pesan-ulang</DetailTableTh>
            <DetailTableTh align="right">PO masuk</DetailTableTh>
            <DetailTableTh align="right">Saran qty</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {lines.map((line) => (
              <DetailTableRow key={`${line.itemId}:${line.warehouseId}`}>
                <DetailTableTd>
                  {line.sku} {line.name}
                  {line.unit ? <span className="text-xs text-muted-foreground"> ({line.unit})</span> : null}
                </DetailTableTd>
                <DetailTableTd>{line.warehouseName}</DetailTableTd>
                <DetailTableTd align="right">
                  {line.qtyAtWarehouse === null ? "—" : formatNumber(line.qtyAtWarehouse)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.minStock)}</DetailTableTd>
                <DetailTableTd align="right">
                  {line.leadTimeDays === null ? "—" : formatNumber(line.leadTimeDays)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.dailyUsage)}</DetailTableTd>
                <DetailTableTd align="right">
                  {line.reorderPoint === null ? "—" : formatNumber(line.reorderPoint)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.incomingQty)}</DetailTableTd>
                <DetailTableTd align="right">
                  {line.suggestedQty === null ? "—" : formatNumber(line.suggestedQty)}
                </DetailTableTd>
                <DetailTableTd>
                  <div className="flex flex-col gap-1">
                    <span>{STATUS_LABELS[line.status]}</span>
                    {line.isCritical ? <span>Kritis</span> : null}
                    {line.usageNote ? <span>{line.usageNote}</span> : null}
                    {line.status === "tidak_dinilai" && line.notAssessedReason ? (
                      <span>{NOT_ASSESSED_REASON_LABELS[line.notAssessedReason]}</span>
                    ) : null}
                  </div>
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
