import type { QuotationRevisionDelta } from "@/lib/reports/quotation-revision-delta"
import { formatCurrency } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

const DIRECTION_LABEL = { naik: "Naik", turun: "Turun", tetap: "Tetap" } as const
const BILLING_PATH_LABEL = {
  "difference-invoice": "Faktur selisih",
  "revision-down-credit": "Kredit revisi-turun",
} as const

/**
 * F-2026-10-20-103 (lapis aman, UI): kartu selisih revisi penawaran.
 * Data dari `getQuotationRevisionDelta` (snapshot revisi terakhir vs
 * grandTotal berjalan, sen). Murni presentasi: notice tampil apa adanya,
 * tidak memanggil faktur selisih/kredit, tidak tampil tanpa snapshot.
 */
export function QuotationRevisionDeltaCard({
  delta,
}: Readonly<{ delta: QuotationRevisionDelta | null }>) {
  if (!delta || delta.snapshotTotalCents === null || delta.deltaCents === null) return null

  return (
    <ReportCardShell
      label="Selisih Revisi Penawaran"
      title="Selisih Revisi Penawaran"
      summary={<>Revisi {delta.revisionNumber} · {DIRECTION_LABEL[delta.direction]}</>}
      isEmpty={false}
      emptyText=""
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Snapshot Revisi Terakhir</DetailTableTh>
          <DetailTableTh>Total Berjalan</DetailTableTh>
          <DetailTableTh>Selisih</DetailTableTh>
          <DetailTableTh>Jalur Penagihan</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          <DetailTableRow>
            <DetailTableTd>{formatCurrency(delta.snapshotTotalCents / 100)}</DetailTableTd>
            <DetailTableTd>{formatCurrency(delta.currentTotalCents / 100)}</DetailTableTd>
            <DetailTableTd>{formatCurrency(delta.deltaCents / 100)}</DetailTableTd>
            <DetailTableTd>
              {delta.billingPath ? BILLING_PATH_LABEL[delta.billingPath] : "—"}
            </DetailTableTd>
          </DetailTableRow>
        </DetailTableBody>
      </DetailTable>
      <p className="mt-4 text-sm text-muted-foreground">{delta.notice}</p>
    </ReportCardShell>
  )
}
