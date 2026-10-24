import Link from "next/link"
import type { WorkCenterLoadPlan } from "@/lib/reports/work-center-load-plan"
import { formatDate, formatNumber, formatPercentage } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
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
 * F-2026-10-22-090-S (BOT 2): papan Beban Rencana Stasiun Kerja.
 *
 * Murni presentasi dari loader `getWorkCenterLoadPlan` (BOT 3, PR #569):
 * beban/kapasitas/persen/keterangan tampil apa adanya dari builder —
 * UI tidak menghitung ulang (AC-LP-12). Kapasitas/persen tanpa dasar
 * (null dari loader) tampil "—", bukan angka karangan (AC-LP-5).
 * Drill hanya minggu berjalan (baris weekIndex 0 dari loader).
 */
export function WorkCenterLoadPlanCard({
  plan,
}: Readonly<{ plan: WorkCenterLoadPlan }>) {
  const currentRows = plan.rows.filter((row) => row.weekIndex === 0)
  const overCapacityCount = currentRows.filter(
    (row) => row.keterangan !== null,
  ).length

  return (
    <ReportCardShell
      label={plan.title}
      title={plan.title}
      summary={
        overCapacityCount > 0
          ? `${overCapacityCount} stasiun melebihi kapasitas minggu ini`
          : "Minggu berjalan + 3 minggu ke depan"
      }
      isEmpty={false}
      emptyText=""
    >
      <p className="mb-4 text-sm text-muted-foreground">{plan.notice}</p>

      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Stasiun</DetailTableTh>
          <DetailTableTh>Minggu</DetailTableTh>
          <DetailTableTh align="right">Beban Rencana (jam)</DetailTableTh>
          <DetailTableTh align="right">Tahap Belum Ada Estimasi</DetailTableTh>
          <DetailTableTh align="right">Kapasitas Tersedia (jam)</DetailTableTh>
          <DetailTableTh align="right">Beban (%)</DetailTableTh>
          <DetailTableTh>Keterangan</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {plan.rows.map((row) => (
            <DetailTableRow
              key={`${row.workCenterId ?? "tanpa-stasiun"}-${row.weekIndex}`}
            >
              <DetailTableTd>
                <span className="font-medium text-foreground">
                  {row.namaStasiun}
                </span>
                {!row.isUnassignedBucket && !row.isActive ? (
                  <span className="text-muted-foreground"> (nonaktif)</span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>
                {formatDate(row.weekStart, { format: "short" })} –{" "}
                {formatDate(row.weekEnd, { format: "short" })}
              </DetailTableTd>
              <DetailTableTd align="right">
                {formatNumber(row.bebanJam, 2)}
              </DetailTableTd>
              <DetailTableTd align="right">
                {formatNumber(row.tahapTanpaEstimasi)}
              </DetailTableTd>
              <DetailTableTd align="right">
                {row.kapasitasJam === null
                  ? "—"
                  : formatNumber(row.kapasitasJam, 2)}
              </DetailTableTd>
              <DetailTableTd align="right">
                {row.persenBeban === null
                  ? "—"
                  : formatPercentage(row.persenBeban, 1)}
              </DetailTableTd>
              <DetailTableTd>{row.keterangan ?? "—"}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>

      <h3 className="mt-6 mb-3 text-sm font-semibold text-foreground">
        {plan.drillTitle}
      </h3>
      {currentRows.every((row) => row.tahapan.length === 0) ? (
        <p className="text-sm text-muted-foreground">
          Belum ada tahap penyusun beban minggu ini
        </p>
      ) : (
        currentRows
          .filter((row) => row.tahapan.length > 0)
          .map((row) => (
            <div
              key={row.workCenterId ?? "tanpa-stasiun"}
              className="mb-5 last:mb-0"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.namaStasiun}
              </p>
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>No. Perintah Kerja</DetailTableTh>
                  <DetailTableTh>Pelanggan / Kendaraan</DetailTableTh>
                  <DetailTableTh>Tahap</DetailTableTh>
                  <DetailTableTh>Status</DetailTableTh>
                  <DetailTableTh align="right">Estimasi (jam)</DetailTableTh>
                  <DetailTableTh>Penanggung Jawab</DetailTableTh>
                  <DetailTableTh>Tenggat WO</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {row.tahapan.map((tahap) => (
                    <DetailTableRow key={tahap.operationId}>
                      <DetailTableTd>
                        <Link
                          href={entityHref("/produksi/perintah-kerja", {
                            id: tahap.workOrderId,
                            slug: tahap.workOrderSlug,
                          })}
                          className="font-medium text-primary hover:underline"
                        >
                          {tahap.workOrderDocumentNo}
                        </Link>
                      </DetailTableTd>
                      <DetailTableTd>
                        {[tahap.customerName, tahap.vehicleLabel]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </DetailTableTd>
                      <DetailTableTd>{tahap.operationName}</DetailTableTd>
                      <DetailTableTd>
                        {statusLabel(tahap.status)}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {tahap.estimatedHours === null
                          ? "—"
                          : formatNumber(tahap.estimatedHours, 2)}
                      </DetailTableTd>
                      <DetailTableTd>
                        {tahap.assignedEmployeeName ?? "—"}
                      </DetailTableTd>
                      <DetailTableTd>
                        {tahap.workOrderEndDate
                          ? formatDate(tahap.workOrderEndDate, {
                              format: "short",
                            })
                          : "—"}
                        {tahap.isOverdue ? (
                          <span className="text-destructive"> (terlambat)</span>
                        ) : null}
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </div>
          ))
      )}
    </ReportCardShell>
  )
}
