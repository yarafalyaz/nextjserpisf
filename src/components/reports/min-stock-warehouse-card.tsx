import type { MinStockWarehouseLine } from "@/lib/reports/min-stock"
import { MIN_STOCK_GLOBAL_LABEL, MIN_STOCK_OVERRIDE_LABEL } from "@/lib/reports/min-stock-data"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
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
 * Kartu Stok Minimum per Gudang (F-2026-10-21-013; label sumber
 * F-2026-10-22-070-E konsumen PR #694).
 *
 * Data dari loader read-only `loadMinStock` (builder
 * `buildMinStockByWarehouse`): sisa InventoryLayer per (barang,
 * gudang) dibandingkan ke minimum efektif per pasangan. Komponen ini
 * murni presentasi — tidak menghitung ulang stok/minimum.
 *
 * Label sumber per baris verbatim dari `minStockSource` backend lewat
 * konstanta MIN_STOCK_OVERRIDE_LABEL / MIN_STOCK_GLOBAL_LABEL
 * (BR-MS-04); `note` = warehouseNote backend tampil apa adanya.
 */
export function MinStockWarehouseCard({
  shortages,
  note,
}: Readonly<{ shortages: MinStockWarehouseLine[]; note?: string }>) {
  const hasGlobal = shortages.some((line) => line.minStockSource === "global")
  const summary = hasGlobal
    ? `${shortages.length} baris di bawah minimum per gudang · termasuk baris ${MIN_STOCK_GLOBAL_LABEL}`
    : `${shortages.length} baris di bawah minimum per gudang · semua baris ${MIN_STOCK_OVERRIDE_LABEL}`
  return (
    <ReportCardShell
      label="Stok Minimum per Gudang"
      title="Stok Minimum per Gudang"
      summary={summary}
      isEmpty={shortages.length === 0}
      emptyText="Tidak ada barang di bawah minimum pada gudang mana pun"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Gudang</DetailTableTh>
          <DetailTableTh>Barang</DetailTableTh>
          <DetailTableTh align="right">Stok gudang</DetailTableTh>
          <DetailTableTh align="right">Minimum</DetailTableTh>
          <DetailTableTh>Sumber minimum</DetailTableTh>
          <DetailTableTh align="right">Kurang</DetailTableTh>
          <DetailTableTh align="right">Nilai Kurang</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {shortages.map((line) => (
            <DetailTableRow key={`${line.itemId}:${line.warehouseId}`}>
              <DetailTableTd>{line.warehouseName}</DetailTableTd>
              <DetailTableTd>
                {line.sku} {line.name}
              </DetailTableTd>
              <DetailTableTd align="right">{formatNumber(line.qtyAtWarehouse)}</DetailTableTd>
              <DetailTableTd align="right">{formatNumber(line.minStock)}</DetailTableTd>
              <DetailTableTd>
                {line.minStockSource === "override" ? MIN_STOCK_OVERRIDE_LABEL : MIN_STOCK_GLOBAL_LABEL}
              </DetailTableTd>
              <DetailTableTd align="right">{formatNumber(line.shortage)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(line.shortageValue)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
      {note ? <p className="mt-4 text-sm text-muted-foreground">{note}</p> : null}
    </ReportCardShell>
  )
}
