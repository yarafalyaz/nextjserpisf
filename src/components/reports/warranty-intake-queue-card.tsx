import Link from "next/link"
import type { WarrantyIntakeQueue } from "@/lib/reports/warranty-claim-intake-queue"
import {
  WARRANTY_INTAKE_COLUMN_LABELS,
  WARRANTY_INTAKE_EMPTY_TEXT,
  WARRANTY_INTAKE_NO_CREATOR_LABEL,
  WARRANTY_INTAKE_NO_ODOMETER_LABEL,
  WARRANTY_INTAKE_NOTICE_TEXT,
  WARRANTY_INTAKE_QUEUE_TITLE,
} from "@/lib/reports/warranty-claim-intake-queue"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * 076-F (F-2026-10-27-076-S, AC-WIQ-F1..F3): antrean klaim garansi intake.
 * Komponen murni presentasi atas `WarrantyIntakeQueue` dari loader server
 * (`getWarrantyIntakeQueue`): umur, tingkat, label, rekap ditempel apa
 * adanya — UI TIDAK menghitung umur/tingkat/rekap, tidak menilai
 * eligibility, tidak menampilkan label keputusan/biaya (BR-WIQ-02/04).
 * Tautan baris hanya ke detail klaim existing; nol tombol Maju/Putus/
 * Tolak/Tautkan WO tahap 1 (Q-WIQ-4). Nol telepon pelanggan (Q-WIQ-6).
 */
export function WarrantyIntakeQueueCard({
  queue,
}: Readonly<{ queue: WarrantyIntakeQueue }>) {
  const { rows, summary } = queue

  return (
    <section
      aria-label={WARRANTY_INTAKE_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {WARRANTY_INTAKE_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.mengendap)} mengendap ·{" "}
          {formatNumber(summary.menunggu)} menunggu penilaian ·{" "}
          {formatNumber(summary.totalIntake)} klaim intake
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{WARRANTY_INTAKE_NOTICE_TEXT}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {WARRANTY_INTAKE_EMPTY_TEXT}
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.umur}</DetailTableTh>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.pelanggan}</DetailTableTh>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.kendaraan}</DetailTableTh>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.part}</DetailTableTh>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.dilaporkan}</DetailTableTh>
              <DetailTableTh>{WARRANTY_INTAKE_COLUMN_LABELS.dibuatOleh}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.claimId}>
                  <DetailTableTd>
                    <span className="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-foreground">
                      {row.levelLabel}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatNumber(row.umurIntakeHari)} hari
                    </span>
                    <Link
                      href={`/produksi/garansi/${row.claimId}`}
                      className="text-primary hover:underline"
                    >
                      #{formatNumber(row.claimId)}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{row.customerName}</DetailTableTd>
                  <DetailTableTd>
                    <span className="font-mono">{row.plateNumber ?? "—"}</span>
                    {row.vehicleName ? (
                      <span className="block text-xs text-muted-foreground">{row.vehicleName}</span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.itemName}
                    <span className="block text-xs text-muted-foreground">{row.itemSku}</span>
                    {row.serialNumber ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {row.serialNumber}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {formatDate(row.reportedAt)}
                    <span className="block text-xs text-muted-foreground">
                      Odometer:{" "}
                      {row.odometerKm === null
                        ? WARRANTY_INTAKE_NO_ODOMETER_LABEL
                        : `${formatNumber(row.odometerKm)} km`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Cakupan: {statusLabel(row.statusCakupan)}
                      {row.laporDiLuarMasa ? " · dilaporkan di luar masa" : ""}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.createdByName ?? WARRANTY_INTAKE_NO_CREATOR_LABEL}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </section>
  )
}
