import Link from "next/link"

import { StatusChip } from "@/components/ui/status-chip"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"

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
 * Desktop (>=768px): tabel penuh. Mobile (<768px): kartu per klaim agar
 * 360-430px tanpa geser horizontal liar, tautan Detail target sentuh 44px.
 * Pola sama DataTable/TableMobileCards: sumber data satu, presentasi dua.
 */
export function WarrantyClaimList({ claims }: { claims: WarrantyClaimListRow[] }) {
  if (claims.length === 0) {
    return (
      <EmptyState title="Belum ada klaim garansi" className="py-12" />
    )
  }

  const detailLink = (claim: WarrantyClaimListRow) => (
    <Link
      href={`/produksi/garansi/${claim.id}`}
      className="inline-flex min-h-11 items-center text-primary hover:underline"
      aria-label={`Lihat detail klaim garansi ${claim.id}`}
    >
      Detail
    </Link>
  )

  const odometer = (claim: WarrantyClaimListRow) =>
    claim.odometerKm === null ? "-" : `${formatNumber(claim.odometerKm)} km`

  return (
    <>
      {/* Tabel (desktop) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" aria-label="Daftar klaim garansi">
          <thead>
            <tr className="border-b border-default text-left">
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Tanggal Lapor</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Kendaraan</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Barang Tercakup</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Keluhan</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Odometer</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Status</th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default">
            {claims.map((claim) => (
              <tr key={claim.id}>
                <td className="px-5 py-3 text-foreground">{formatDate(claim.reportedAt)}</td>
                <td className="px-5 py-3 text-foreground font-mono">{claim.customerVehicle.plateNumber ?? "-"}</td>
                <td className="px-5 py-3 text-foreground">{claim.coverage.item.name}</td>
                <td className="px-5 py-3 text-foreground">
                  <span className="line-clamp-2 max-w-72">{claim.complaint}</span>
                </td>
                <td className="px-5 py-3 text-foreground tabular-nums">{odometer(claim)}</td>
                <td className="px-5 py-3">
                  <StatusChip status={claim.status} />
                  <span className="sr-only">{statusLabel(claim.status)}</span>
                </td>
                <td className="px-5 py-3">{detailLink(claim)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kartu (mobile): satu kartu per klaim, tanpa geser horizontal */}
      <ul role="list" aria-label="Daftar klaim garansi" className="flex flex-col gap-3 p-3 md:hidden">
        {claims.map((claim) => (
          <li key={claim.id} className="rounded-lg border border-default p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-mono text-sm text-foreground">
                {claim.customerVehicle.plateNumber ?? "-"}
              </span>
              <span className="shrink-0">
                <StatusChip status={claim.status} />
                <span className="sr-only">{statusLabel(claim.status)}</span>
              </span>
            </div>
            <dl className="mt-2 divide-y divide-default text-sm">
              <div className="flex items-start justify-between gap-3 py-2">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">Tanggal Lapor</dt>
                <dd className="min-w-0 break-words text-right text-foreground">{formatDate(claim.reportedAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">Barang Tercakup</dt>
                <dd className="min-w-0 break-words text-right text-foreground">{claim.coverage.item.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">Keluhan</dt>
                <dd className="min-w-0 break-words text-right text-foreground">{claim.complaint}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">Odometer</dt>
                <dd className="min-w-0 break-words text-right tabular-nums text-foreground">{odometer(claim)}</dd>
              </div>
            </dl>
            <div className="mt-1 flex justify-end border-t border-default pt-1">{detailLink(claim)}</div>
          </li>
        ))}
      </ul>
    </>
  )
}
