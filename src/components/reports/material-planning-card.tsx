import type { MaterialPlan } from "@/lib/reports/material-planning"
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
import { ReorderPointCard } from "./reorder-point-card"
import type { ReorderPointResult } from "@/lib/reports/reorder-point"

/**
 * Kartu perencanaan material (MRP-Lite report-only).
 *
 * Agregat per barang verbatim dari `buildMaterialPlan`; detail pasang
 * per (barang, gudang) dari kartu titik pesan-ulang existing. PO masuk
 * dikurangkan sekali di agregat barang (PurchaseOrder tanpa
 * warehouseId) — jangan menjumlahkan saran per gudang di sini.
 * Detail per gudang memakai hasil titik pesan-ulang mentah lewat kartu
 * existing; nilainya tidak dihitung ulang.
 */
export function MaterialPlanningCard({
  plan,
  pairResult,
  usageWindowDays,
  usageWindowStartLabel,
}: Readonly<{
  plan: MaterialPlan
  pairResult: ReorderPointResult
  usageWindowDays: number
  usageWindowStartLabel: string
}>) {
  const { lines, totals } = plan
  const summary =
    `${totals.items} barang · ${totals.needsOrder} perlu dipesan · ` +
    `saran total ${formatNumber(totals.suggestedQty)} · ${totals.notAssessedPairs} pasangan tidak dinilai`
  return (
    <ReportCardShell
      label="Perencanaan Material"
      title="Perencanaan Material (MRP-Lite)"
      summary={summary}
      isEmpty={lines.length === 0}
      emptyText="Belum ada barang aktif non-jasa untuk direncanakan"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Saran per barang = maksimum 0 dari titik pesan-ulang total dikurangi stok total dan PO
        masuk. PO masuk hanya ada per barang (PurchaseOrder tanpa gudang), jadi dikurangkan sekali di
        agregat ini — bukan sekali per gudang. Laju pakai memakai MaterialIssue selesai selama{" "}
        {usageWindowDays} hari terakhir sejak {usageWindowStartLabel}.
      </p>
      <div className="overflow-x-auto">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Barang</DetailTableTh>
            <DetailTableTh align="right">Titik total</DetailTableTh>
            <DetailTableTh align="right">Stok total</DetailTableTh>
            <DetailTableTh align="right">Laju/hari</DetailTableTh>
            <DetailTableTh align="right">Cakupan (hari)</DetailTableTh>
            <DetailTableTh align="right">PO masuk</DetailTableTh>
            <DetailTableTh align="right">Saran qty</DetailTableTh>
            <DetailTableTh>Gudang dinilai / tak dinilai</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {lines.map((line) => (
              <DetailTableRow key={line.itemId}>
                <DetailTableTd>
                  {line.sku} {line.name}
                  {line.unit ? <span className="text-xs text-muted-foreground"> ({line.unit})</span> : null}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.totalReorderPoint)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.totalStock)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.dailyUsage)}</DetailTableTd>
                <DetailTableTd align="right">
                  {line.daysOfCoverage === null ? "tanpa laju" : formatNumber(line.daysOfCoverage)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.incomingQty)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(line.suggestedQty)}</DetailTableTd>
                <DetailTableTd>
                  {line.assessedPairs} / {line.notAssessedPairs}
                </DetailTableTd>
                <DetailTableTd>
                  <div className="flex flex-col gap-1">
                    <span>{line.needsOrder ? "Perlu dipesan" : "Cukup"}</span>
                    {line.anyCritical ? <span>Kritis</span> : null}
                  </div>
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
      <div style={{ marginTop: 16 }}>
        <ReorderPointCard
          result={pairResult}
          usageWindowDays={usageWindowDays}
          usageWindowStartLabel={usageWindowStartLabel}
        />
      </div>
    </ReportCardShell>
  )
}
