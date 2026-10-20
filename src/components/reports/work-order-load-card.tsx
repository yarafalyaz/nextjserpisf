import Link from "next/link"
import type { WorkOrderLoad } from "@/lib/reports/work-order-load"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
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
 * F-2026-10-20-02 (tahap frontend): beban perintah kerja aktif.
 *
 * Data dari loader read-only `getWorkOrderLoad` (PR #224): per status WO
 * aktif + per WO, jam tenaga kerja/mesin dan nilai beban adalah snapshot
 * baris ProductionCost — tidak dihitung ulang dari tarif master dan tidak
 * dijurnal terpisah (jurnal routing = HPP ganda, PUTUSAN manager). Inti
 * model WorkCenter/Routing ditunda-teknis; komponen ini murni presentasi.
 */
export function WorkOrderLoadCard({ load }: Readonly<{ load: WorkOrderLoad }>) {
  return (
    <ReportCardShell
      label="Beban Perintah Kerja"
      title="Beban Perintah Kerja"
      summary={
        <>
          {load.totalActive} perintah kerja aktif · {formatNumber(load.totalLaborHours)} jam tenaga
          kerja · {formatNumber(load.totalMachineHours)} jam mesin ·{" "}
          {formatCurrency(load.totalAmount)}
        </>
      }
      isEmpty={load.workOrders.length === 0}
      emptyText="Belum ada perintah kerja aktif"
    >
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh align="right">Jam Tenaga Kerja</DetailTableTh>
              <DetailTableTh align="right">Jam Mesin</DetailTableTh>
              <DetailTableTh align="right">Nilai Beban</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {load.workOrders.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/produksi/perintah-kerja", row)}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.documentNo}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{statusLabel(row.status)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.laborHours)} jam</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.machineHours)} jam</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.totalAmount)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
    </ReportCardShell>
  )
}
