import type { WorkOrderMaterialNeeds } from "@/lib/reports/work-order-material-needs"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-20-19: kartu Kebutuhan Material di detail perintah kerja.
 *
 * Data dari loader read-only `getWorkOrderMaterialNeeds`: butuh dari
 * WorkOrderItem non-replaced, keluar dari MI `completed`, dipesan bersih
 * dari PO non-cancelled tertaut WO. Baris jasa selalu terpenuhi.
 * Komponen murni presentasi — tanpa query, tanpa mutasi.
 *
 * F-51(a)/F-52: kolom Terikat menampilkan committedOtherQty; Tersedia
 * Efektif = qtyOnHand − terikat. Status kekurangan dirinci cakupan
 * incoming: tertutup tepat waktu / terlambat / belum dijadwalkan bila
 * incoming menutup shortage.
 */
function fmtDate(d: Date | null | undefined): string {
  if (!d) return ""
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function WorkOrderMaterialNeedsCard({
  needs,
}: Readonly<{ needs: WorkOrderMaterialNeeds }>) {
  return (
    <ReportCardShell
      label="Kebutuhan Material"
      title="Kebutuhan Material"
      summary={
        needs.allFulfilled
          ? "Semua kebutuhan terpenuhi"
          : needs.shortageCount > 0
            ? `${needs.shortageCount} baris kekurangan stok`
            : "Belum semua material keluar"
      }
      isEmpty={needs.lines.length === 0}
      emptyText="Belum ada kebutuhan material untuk perintah kerja ini"
    >
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh align="right">Butuh</DetailTableTh>
              <DetailTableTh align="right">Terikat WO lain</DetailTableTh>
              <DetailTableTh align="right">Tersedia efektif</DetailTableTh>
              <DetailTableTh align="right">Keluar</DetailTableTh>
              <DetailTableTh align="right">Dipesan</DetailTableTh>
              <DetailTableTh align="right">Sisa</DetailTableTh>
              <DetailTableTh align="right">Kurang</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {needs.lines.map((line) => (
                <DetailTableRow key={line.itemId}>
                  <DetailTableTd>
                    {line.name}
                    {line.unitOfMeasure ? (
                      <span className="text-muted-foreground"> ({line.unitOfMeasure})</span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd align="right">{line.requiredQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.committedOtherQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.effectiveAvailableQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.issuedQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.orderedQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.remainingQty}</DetailTableTd>
                  <DetailTableTd align="right">{line.shortageQty}</DetailTableTd>
                  <DetailTableTd>
                    {line.isService
                      ? "Jasa — terpenuhi"
                      : line.fulfilled
                        ? "Terpenuhi"
                        : line.shortageQty > 0
                          ? line.incomingCover === "tepat-waktu"
                            ? `Kekurangan stok — tertutup incoming tepat waktu (${fmtDate(line.incomingEarliestDate)})`
                            : line.incomingCover === "terlambat"
                              ? `Kekurangan stok — incoming terlambat (${fmtDate(line.incomingEarliestDate)})`
                              : line.incomingCover === "belum-jadwal"
                                ? "Kekurangan stok — incoming belum dijadwalkan"
                                : "Kekurangan stok"
                          : "Belum keluar"}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
            <DetailTableFoot>
              <DetailTableFootRow>
                <DetailTableTd className="font-bold">Total</DetailTableTd>
                <DetailTableTd align="right" className="font-bold">{needs.totalRequired}</DetailTableTd>
                <DetailTableTd>{null}</DetailTableTd>
                <DetailTableTd align="right" className="font-bold">{needs.totalIssued}</DetailTableTd>
                <DetailTableTd align="right" className="font-bold">{needs.totalOrdered}</DetailTableTd>
                <DetailTableTd>{null}</DetailTableTd>
                <DetailTableTd>{null}</DetailTableTd>
                <DetailTableTd>{null}</DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          </DetailTable>
    </ReportCardShell>
  )
}
