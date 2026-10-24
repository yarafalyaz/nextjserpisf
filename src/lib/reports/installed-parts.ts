/**
 * Builder murni registri part terpasang per kendaraan
 * (F-2026-10-22-072-S, inti F-2026-10-21-024).
 *
 * Sumber kebenaran = tabel `InstalledPart` (lahir otomatis dari
 * MaterialIssue completed lewat installed-part.service.ts). Builder ini
 * TIDAK menurunkan registri dari dokumen issue mentah lagi (jalur b
 * lama): status diputus di sini dari qtyRemoved kumulatif —
 *   TERPASANG          qtyRemoved = 0
 *   SEBAGIAN_DILEPAS   0 < qtyRemoved < qty
 *   DILEPAS            qtyRemoved = qty
 * (BR-IP-05; UI menerima kata ini apa adanya, dilarang hitung ulang.)
 *
 * `sourceCancelled` (Q-IP-5): penanda dokumen sumber (WO/MI) tidak lagi
 * berstatus completed — baris TIDAK dihapus dan status lepas tetap
 * berjalan; penanda hanya informasi bahwa sumbernya berubah.
 * Kendaraan tanpa part menghasilkan daftar kosong — bukan error.
 * Tanpa Prisma, tanpa mutasi, tanpa jurnal.
 */

import {
  deriveInstalledPartStatus,
  type InstalledPartStatus,
} from "@/lib/services/installed-part.service"

export type { InstalledPartStatus }

export interface InstalledPartRegistryInput {
  id: number
  itemId: number
  itemName: string
  itemSku: string | null
  serialNumber: string | null
  qty: number
  qtyRemoved: number
  installedAt: Date
  /** expiresAt coverage tertaut; null = part tanpa cakupan garansi. */
  warrantyExpiresAt: Date | null
  removedAt: Date | null
  removalReason: string | null
  replacedByInstalledPartId: number | null
  /** Status dokumen sumber saat dibaca; bukan "completed" = batal sumber. */
  sourceStatus: string
  sourceWorkOrderId: number | null
  sourceProjectId: number | null
}

export interface InstalledPartRegistryRow {
  id: number
  itemId: number
  itemName: string
  itemSku: string | null
  serialNumber: string | null
  qty: number
  qtyRemoved: number
  qtyRemaining: number
  status: InstalledPartStatus
  /** Kata status verbatim untuk UI (sama dengan `status`). */
  statusLabel: InstalledPartStatus
  installedAt: Date
  warrantyExpiresAt: Date | null
  removedAt: Date | null
  removalReason: string | null
  replacedByInstalledPartId: number | null
  sourceCancelled: boolean
  sourceWorkOrderId: number | null
  sourceProjectId: number | null
}

export interface InstalledPartsRegistry {
  rows: InstalledPartRegistryRow[]
  total: number
  /** Baris yang masih terpasang penuh (TERPASANG). */
  activeCount: number
}

export function buildInstalledPartsRegistry(
  input: { parts: readonly InstalledPartRegistryInput[] },
): InstalledPartsRegistry {
  const rows: InstalledPartRegistryRow[] = input.parts.map((p) => {
    const status = deriveInstalledPartStatus(p.qty, p.qtyRemoved)
    return {
      id: p.id,
      itemId: p.itemId,
      itemName: p.itemName,
      itemSku: p.itemSku,
      serialNumber: p.serialNumber,
      qty: p.qty,
      qtyRemoved: p.qtyRemoved,
      qtyRemaining: Math.max(0, p.qty - p.qtyRemoved),
      status,
      statusLabel: status,
      installedAt: p.installedAt,
      warrantyExpiresAt: p.warrantyExpiresAt,
      removedAt: p.removedAt,
      removalReason: p.removalReason,
      replacedByInstalledPartId: p.replacedByInstalledPartId,
      sourceCancelled: p.sourceStatus !== "completed",
      sourceWorkOrderId: p.sourceWorkOrderId,
      sourceProjectId: p.sourceProjectId,
    }
  })

  rows.sort((a, b) => {
    const byDate = b.installedAt.getTime() - a.installedAt.getTime()
    if (byDate !== 0) return byDate
    if (a.id !== b.id) return b.id - a.id
    return (a.serialNumber ?? "") < (b.serialNumber ?? "") ? -1 : 1
  })

  return {
    rows,
    total: rows.length,
    activeCount: rows.filter((r) => r.status === "TERPASANG").length,
  }
}
