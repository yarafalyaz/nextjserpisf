import type { BomRevisionImpact } from "@/lib/reports/bom-revision-impact"
import { statusLabel } from "@/lib/utils/status-labels"
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
 * Kartu "Dampak Revisi BOM Terpasang" (F-2026-10-22-068-S AC-BOM68-8,
 * t_b5234708). Konsumen UI pertama loader yatim `loadBomRevisionImpact`
 * (bom-revision-impact-data.ts, konsumen .tsx=0 sebelum kartu ini):
 * dampak pin revisi SAAT INI ke order berjalan — WO yang mem-pin revisi
 * ini beserta qty sudah keluar / belum keluar / baris ter-issue, plus
 * hitungan PO produksi + PO pembelian terbuka tertaut.
 *
 * Murni presentasi: angka dan status dari builder `buildBomRevisionImpact`
 * ditampilkan apa adanya — UI tidak menghitung ulang kebutuhan/stok.
 * Baris WO dengan issuedLineCount > 0 berlabel eksplisit "Sudah ter-issue
 * — terkunci" (AC-BOM68-6 sisi baca): material ter-issue tidak dapat
 * ditarik oleh ganti revisi (BR-BOM68-02, vonis BOT 4 F-074-V).
 * Halaman tidak merender kartu ini bila tidak ada WO yang mem-pin revisi.
 */
export function BomRevisionImpactCard({
  impact,
  currentRevisionNo,
}: Readonly<{ impact: BomRevisionImpact; currentRevisionNo: number }>) {
  return (
    <ReportCardShell
      label="Dampak Revisi BOM Terpasang"
      title="Dampak Revisi BOM Terpasang"
      summary={
        <>
          Rev. {currentRevisionNo} terpasang · {formatNumber(impact.activeWorkOrderCount)} perintah
          kerja aktif · {formatNumber(impact.openPurchaseOrderCount)} order pembelian terbuka
        </>
      }
      isEmpty={impact.workOrders.length === 0}
      emptyText="Tidak ada perintah kerja yang memakai revisi BOM ini"
    >
      <div className="flex flex-col gap-4">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Perintah Kerja</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
            <DetailTableTh align="right">Sudah keluar</DetailTableTh>
            <DetailTableTh align="right">Belum keluar</DetailTableTh>
            <DetailTableTh align="right">Baris ter-issue</DetailTableTh>
            <DetailTableTh>Keterangan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {impact.workOrders.map((wo) => {
              const locked = wo.issuedLineCount > 0
              return (
                <DetailTableRow key={wo.id}>
                  <DetailTableTd>{wo.documentNo}</DetailTableTd>
                  <DetailTableTd>{statusLabel(wo.status)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(wo.issuedQty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(wo.outstandingQty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(wo.issuedLineCount)}</DetailTableTd>
                  <DetailTableTd>
                    {locked ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        Sudah ter-issue — terkunci
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Belum ada material keluar</span>
                    )}
                  </DetailTableTd>
                </DetailTableRow>
              )
            })}
          </DetailTableBody>
        </DetailTable>
        <p role="note" className="text-xs text-muted-foreground">
          {formatNumber(impact.issuedWorkOrderCount)} perintah kerja sudah punya material keluar
          (terkunci untuk ganti revisi tanpa persetujuan) · {formatNumber(impact.productionOrderCount)}{" "}
          order produksi memakai revisi ini · sisa order pembelian terbuka{" "}
          {formatNumber(impact.openPurchaseQty)}.
        </p>
      </div>
    </ReportCardShell>
  )
}
