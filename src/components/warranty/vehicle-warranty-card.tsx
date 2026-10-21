import Link from "next/link"

import { formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"

export interface WarrantyCoverageCardRow {
  id: number
  itemName: string
  itemSku: string | null
  status: string
  installedAt: Date
  expiresAt: Date
  warrantyMonths: number
  mileageLimitKm: number | null
  serialNumber: string | null
  termsSnapshot: string
  claimCount: number
}

/**
 * Kartu garansi kendaraan (F-2026-10-21-021 tahap UI).
 *
 * Dipasang di detail CustomerVehicle. Menampilkan cakupan apa adanya dari
 * `listWarrantyCoveragesByVehicle`: `termsSnapshot` verbatim, status
 * cakupan apa adanya, dan serialKey kosong ("") TIDAK PERNAH ditampilkan
 * sebagai nomor serial — status "belum ada nomor serial tercatat"
 * dinyatakan eksplisit. Kartu tidak menilai eligibility kendaraan ini.
 */
export function VehicleWarrantyCard({
  coverages,
  vehicleId,
  canCreateClaim,
}: {
  coverages: WarrantyCoverageCardRow[]
  vehicleId: number
  canCreateClaim: boolean
}) {
  return (
    <section
      aria-label="Garansi kendaraan"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Garansi</h2>
        {canCreateClaim && coverages.length > 0 && (
          <Link
            href={`/produksi/garansi/tambah?kendaraan=${vehicleId}`}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
          >
            Buat Klaim Garansi
          </Link>
        )}
      </div>
      <div className="p-4 px-5">
        {coverages.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            Belum ada cakupan garansi tercatat untuk kendaraan ini
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-default">
            {coverages.map((c) => {
              const serial = c.serialNumber?.trim() ? c.serialNumber : null
              return (
                <article key={c.id} aria-label={`Cakupan garansi ${c.itemName}`} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[0.9375rem] font-medium text-foreground">
                      {c.itemName}
                      {c.itemSku ? <span className="text-muted-foreground"> · {c.itemSku}</span> : null}
                    </span>
                    <StatusChip status={c.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nomor Serial</dt>
                      <dd className="text-sm text-foreground">
                        {serial === null ? (
                          <span>Belum ada nomor serial tercatat</span>
                        ) : (
                          <span className="font-mono">{serial}</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Terpasang</dt>
                      <dd className="text-sm text-foreground">{formatDate(c.installedAt)}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Berakhir</dt>
                      <dd className="text-sm text-foreground">{formatDate(c.expiresAt)}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Masa Garansi</dt>
                      <dd className="text-sm text-foreground">{c.warrantyMonths} bulan</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Batas Odometer</dt>
                      <dd className="text-sm text-foreground tabular-nums">
                        {c.mileageLimitKm === null ? "Tanpa batas tercatat" : `${formatNumber(c.mileageLimitKm)} km`}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Klaim Tercatat</dt>
                      <dd className="text-sm text-foreground tabular-nums">{c.claimCount}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Syarat Garansi Saat Pemasangan (Snapshot)
                    </span>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{c.termsSnapshot}</p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
