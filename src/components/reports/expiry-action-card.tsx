import type { ExpiryActionQueue } from "@/lib/reports/serial-batch-stock"
import { formatCurrencyExact, formatDate, formatQuantity } from "@/lib/utils/format"
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
 * Kartu antrean aksi kadaluwarsa (FEFO) di laporan nomor seri/batch.
 *
 * Murni presentasi: urutan, ember, dan nilai verbatim dari
 * `buildExpiryActionQueue`. Nilai = qty × Item.cost kini dan selalu
 * dilabeli "estimasi" — bukan nilai buku lapisan FIFO.
 */
export function ExpiryActionCard({ queue }: Readonly<{ queue: ExpiryActionQueue }>) {
  const { lines, totals } = queue
  const summary =
    `${totals.expiredLines} kedaluwarsa · ${totals.expiringSoonLines} segera kedaluwarsa · ` +
    `estimasi nilai terancam ${formatCurrencyExact(totals.expiredEstimatedValue + totals.expiringSoonEstimatedValue)}`
  return (
    <ReportCardShell
      label="Antrean Aksi Kadaluarsa"
      title="Antrean Aksi Kadaluarsa (FEFO)"
      summary={summary}
      isEmpty={lines.length === 0}
      emptyText="Tidak ada batch kedaluwarsa atau yang kedaluwarsa dalam 30 hari ke depan"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Urut kedaluwarsa paling awal — keluarkan / tindak batch teratas lebih dulu. Nilai adalah
        estimasi qty × harga pokok barang saat ini, bukan nilai buku lapisan FIFO.
      </p>
      <div className="overflow-x-auto">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Barang</DetailTableTh>
            <DetailTableTh>Gudang</DetailTableTh>
            <DetailTableTh>Batch</DetailTableTh>
            <DetailTableTh align="right">Qty</DetailTableTh>
            <DetailTableTh>Kedaluwarsa</DetailTableTh>
            <DetailTableTh align="right">Sisa (hari)</DetailTableTh>
            <DetailTableTh align="right">Estimasi nilai</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {lines.map((line) => (
              <DetailTableRow key={`${line.warehouseName}:${line.itemSku}:${line.code}`}>
                <DetailTableTd>
                  {line.itemSku} {line.itemName}
                </DetailTableTd>
                <DetailTableTd>{line.warehouseName}</DetailTableTd>
                <DetailTableTd>{line.code}</DetailTableTd>
                <DetailTableTd align="right">{formatQuantity(line.qty)}</DetailTableTd>
                <DetailTableTd>{formatDate(line.expiryDate, { format: "short" })}</DetailTableTd>
                <DetailTableTd align="right">{formatQuantity(line.daysToExpiry)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrencyExact(line.estimatedValue)}</DetailTableTd>
                <DetailTableTd>
                  {line.bucket === "kedaluwarsa" ? "Kedaluwarsa" : "Segera kedaluwarsa"}
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
