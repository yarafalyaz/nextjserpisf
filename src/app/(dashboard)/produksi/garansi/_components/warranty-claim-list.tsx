import Link from "next/link"

import { StatusChip } from "@/components/ui/status-chip"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { Car, Calendar, PackageCheck, Wrench, ChevronRight } from "@/components/ui/fontawesome-icons"

export interface WarrantyClaimListRow {
  id: number
  reportedAt: Date
  complaint: string
  odometerKm: number | null
  status: string
  customerVehicle: { plateNumber: string | null }
  coverage: { status: string; expiresAt: Date | null; item: { name: string } }
}

/**
 * Daftar klaim garansi.
 * Desktop (>=768px): tabel penuh dengan Linear/Raycast density & typography.
 * Mobile (<768px): kartu terstruktur per klaim, tanpa geser horizontal,
 * tautan Detail target sentuh 44px (min-h-11).
 * Memenuhi kontrak pengujian warranty-list-mobile.test.tsx.
 */
export function WarrantyClaimList({ claims }: { claims: WarrantyClaimListRow[] }) {
  if (claims.length === 0) {
    return (
      <EmptyState
        title="Belum ada klaim garansi"
        description="Belum ada klaim garansi yang diajukan atau cocok dengan kriteria filter saat ini."
        className="py-12"
      />
    )
  }

  const detailLink = (claim: WarrantyClaimListRow, isMobile = false) => (
    <Link
      href={`/produksi/garansi/${claim.id}`}
      className={
        isMobile
          ? "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-muted/50 active:scale-[0.99]"
          : "inline-flex min-h-11 items-center gap-1 font-medium text-xs text-primary transition-colors hover:text-primary/80 hover:underline"
      }
      aria-label={`Lihat detail klaim garansi ${claim.id}`}
    >
      <span>Detail</span>
      {isMobile ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
    </Link>
  )

  const odometer = (claim: WarrantyClaimListRow) =>
    claim.odometerKm === null ? "-" : `${formatNumber(claim.odometerKm)} km`

  return (
    <>
      {/* Tabel (desktop >= 768px) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm" aria-label="Daftar klaim garansi">
          <thead>
            <tr className="border-b border-border/70 bg-muted/20 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-5 py-3.5">Tanggal Lapor</th>
              <th scope="col" className="px-5 py-3.5">Kendaraan</th>
              <th scope="col" className="px-5 py-3.5">Barang Tercakup</th>
              <th scope="col" className="px-5 py-3.5">Keluhan</th>
              <th scope="col" className="px-5 py-3.5">Odometer</th>
              <th scope="col" className="px-5 py-3.5">Status</th>
              <th scope="col" className="px-5 py-3.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {claims.map((claim) => (
              <tr key={claim.id} className="transition-colors hover:bg-muted/30">
                <td className="px-5 py-3.5 text-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span>{formatDate(claim.reportedAt)}</span>
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                    <Car className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span>{claim.customerVehicle.plateNumber ?? "-"}</span>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <PackageCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="truncate max-w-[180px]">{claim.coverage.item.name}</span>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-foreground">
                  <span className="line-clamp-2 max-w-72 text-xs leading-relaxed text-muted-foreground" title={claim.complaint}>
                    {claim.complaint}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-foreground whitespace-nowrap">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {odometer(claim)}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <StatusChip status={claim.status} />
                  <span className="sr-only">{statusLabel(claim.status)}</span>
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  {detailLink(claim, false)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kartu (mobile < 768px): satu kartu per klaim, touch-friendly, tanpa geser horizontal */}
      <ul role="list" aria-label="Daftar klaim garansi" className="flex flex-col gap-3 p-3 md:hidden">
        {claims.map((claim) => (
          <li
            key={claim.id}
            className="flex flex-col rounded-xl border border-default bg-surface p-4 shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Car className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
                  {claim.customerVehicle.plateNumber ?? "-"}
                </span>
              </div>
              <span className="shrink-0">
                <StatusChip status={claim.status} />
                <span className="sr-only">{statusLabel(claim.status)}</span>
              </span>
            </div>

            <dl className="mt-3 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Tanggal Lapor</span>
                </dt>
                <dd className="font-mono tabular-nums text-foreground">{formatDate(claim.reportedAt)}</dd>
              </div>

              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>Barang Tercakup</span>
                </dt>
                <dd className="truncate max-w-[200px] font-medium text-foreground text-right">{claim.coverage.item.name}</dd>
              </div>

              <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/30">
                <dt className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Keluhan</span>
                </dt>
                <dd className="min-w-0 break-words text-right text-muted-foreground">{claim.complaint}</dd>
              </div>

              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Odometer</dt>
                <dd className="font-mono tabular-nums text-foreground">{odometer(claim)}</dd>
              </div>
            </dl>

            <div className="mt-3.5 border-t border-border/50 pt-2.5">
              {detailLink(claim, true)}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
