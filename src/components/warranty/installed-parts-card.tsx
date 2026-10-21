import Link from "next/link"

import { formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import type { InstalledPartRow } from "@/lib/reports/installed-parts"

/**
 * Kartu "Part terpasang" di detail CustomerVehicle (F-2026-10-21-024 UI).
 *
 * Murni presentasi: baris dari builder `buildInstalledParts` (lewat loader
 * `getInstalledParts`) ditampilkan apa adanya — UI tidak menurunkan status
 * pasang sendiri. Pemisahan seksi hanya mengelompokkan status yang sudah
 * diputus builder: terpasang (active; expired = garansi selesai, part masih
 * terpasang) dan riwayat dilepas/diganti (replaced, revoked).
 *
 * Serial kosong/null tidak pernah dirender sebagai nomor serial; status
 * "belum ada nomor serial tercatat" dinyatakan eksplisit (pola F-021).
 * Baris tanpa coverage menampilkan "Tanpa cakupan garansi", bukan tanggal
 * berakhir kosong.
 */
export function InstalledPartsCard({ rows }: { rows: InstalledPartRow[] }) {
  const installed = rows.filter((r) => r.status === "active" || r.status === "expired")
  const history = rows.filter((r) => r.status === "replaced" || r.status === "revoked")

  return (
    <section
      aria-label="Part terpasang"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Part Terpasang</h2>
      </div>
      <div className="p-4 px-5">
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            Belum ada part terpasang tercatat untuk kendaraan ini
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {installed.length > 0 && (
              <div className="flex flex-col divide-y divide-default">
                {installed.map((row) => (
                  <InstalledPartEntry key={rowKey(row)} row={row} />
                ))}
              </div>
            )}
            {history.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Riwayat Dilepas / Diganti
                </h3>
                <div className="flex flex-col divide-y divide-default">
                  {history.map((row) => (
                    <InstalledPartEntry key={rowKey(row)} row={row} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function rowKey(row: InstalledPartRow): string {
  return `${row.workOrderId}-${row.itemId}-${row.serialNumber ?? ""}`
}

function InstalledPartEntry({ row }: { row: InstalledPartRow }) {
  const serial = row.serialNumber?.trim() ? row.serialNumber : null
  return (
    <article aria-label={`Part terpasang ${row.itemName}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.9375rem] font-medium text-foreground">
          {row.itemName}
          {row.itemSku ? <span className="text-muted-foreground"> · {row.itemSku}</span> : null}
        </span>
        <StatusChip status={row.status} />
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
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Perintah Kerja Asal</dt>
          <dd className="text-sm text-foreground">
            <Link
              href={entityHref("/produksi/perintah-kerja", { id: row.workOrderId })}
              className="font-mono text-primary hover:underline"
            >
              #{row.workOrderId}
            </Link>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal Pasang</dt>
          <dd className="text-sm text-foreground">{formatDate(row.installedAt)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Garansi Berakhir</dt>
          <dd className="text-sm text-foreground">
            {row.warrantyExpiresAt === null
              ? "Tanpa cakupan garansi"
              : formatDate(row.warrantyExpiresAt)}
          </dd>
        </div>
        {row.status === "replaced" && (
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diganti Lewat</dt>
            <dd className="text-sm text-foreground">
              {row.replacedByWorkOrderId === null ? (
                "WO pengganti belum tercatat"
              ) : (
                <Link
                  href={entityHref("/produksi/perintah-kerja", { id: row.replacedByWorkOrderId })}
                  className="font-mono text-primary hover:underline"
                >
                  #{row.replacedByWorkOrderId}
                </Link>
              )}
            </dd>
          </div>
        )}
      </dl>
    </article>
  )
}
