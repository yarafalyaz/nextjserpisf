import type { MinStockWarehouseLine } from "@/lib/reports/min-stock"
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
 * F-2026-10-21-013 (tahap frontend): kartu Stok Minimum per Gudang.
 *
 * Data dari loader read-only `loadMinStock` (builder
 * `buildMinStockByWarehouse`, PR #281): sisa InventoryLayer per
 * (barang, gudang) dibandingkan ke minimum global. Komponen ini murni
 * presentasi — tidak menghitung ulang stok, tidak menyentuh notifikasi
 * low-stock; kartu tidak dirender halaman bila daftar kosong.
 * `note` = `MinStockReport.warehouseNote` backend (PR #285 merged) tampil
 * verbatim, bukan kalimat frontend — vonis Lead-Arch 11:36.
 */
export function MinStockWarehouseCard({
  shortages,
  note,
}: Readonly<{ shortages: MinStockWarehouseLine[]; note?: string }>) {
  return (
    <ReportCardShell
      label="Stok Minimum per Gudang"
      title="Stok Minimum per Gudang"
      summary={`${shortages.length} baris di bawah minimum per gudang`}
      isEmpty={shortages.length === 0}
      emptyText="Tidak ada barang di bawah minimum pada gudang mana pun"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Gudang</DetailTableTh>
          <DetailTableTh>Barang</DetailTableTh>
          <DetailTableTh align="right">Stok gudang</DetailTableTh>
          <DetailTableTh align="right">Minimum (global)</DetailTableTh>
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
