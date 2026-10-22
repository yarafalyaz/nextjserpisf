/**
 * Loader read-only registri part terpasang per kendaraan
 * (F-2026-10-22-072-S, inti F-2026-10-21-024).
 *
 * Sumber = tabel `InstalledPart` kendaraan ini (lahir otomatis dari
 * MaterialIssue completed; tanpa backfill historis per Q-IP-4, jadi
 * kendaraan lama bisa kosong walau pernah pasang part sebelum fitur
 * ini). Keputusan status di builder murni `buildInstalledPartsRegistry`.
 *
 * Status dokumen sumber (MaterialIssue + WO/Project pemiliknya) dimuat
 * untuk penanda batal sumber Q-IP-5: baris tidak dihapus, status lepas
 * tetap berjalan. Read-only: tanpa mutasi, tanpa jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildInstalledPartsRegistry,
  type InstalledPartsRegistry,
} from "./installed-parts"

export async function getInstalledParts(
  customerVehicleId: number,
): Promise<InstalledPartsRegistry & { customerVehicleId: number }> {
  const parts = await prisma.installedPart.findMany({
    where: { customerVehicleId },
    select: {
      id: true,
      itemId: true,
      serialNumber: true,
      qty: true,
      qtyRemoved: true,
      installedAt: true,
      removedAt: true,
      removalReason: true,
      replacedByInstalledPartId: true,
      item: { select: { name: true, sku: true } },
      warrantyCoverage: { select: { expiresAt: true } },
      materialIssueItem: {
        select: {
          materialIssue: {
            select: { status: true, workOrderId: true, projectId: true },
          },
        },
      },
    },
    orderBy: [{ installedAt: "desc" }, { id: "desc" }],
  })

  return {
    customerVehicleId,
    ...buildInstalledPartsRegistry({
      parts: parts.map((p) => ({
        id: p.id,
        itemId: p.itemId,
        itemName: p.item.name,
        itemSku: p.item.sku,
        serialNumber: p.serialNumber,
        qty: Number(p.qty),
        qtyRemoved: Number(p.qtyRemoved),
        installedAt: p.installedAt,
        warrantyExpiresAt: p.warrantyCoverage?.expiresAt ?? null,
        removedAt: p.removedAt,
        removalReason: p.removalReason,
        replacedByInstalledPartId: p.replacedByInstalledPartId,
        sourceStatus: p.materialIssueItem.materialIssue.status,
        sourceWorkOrderId: p.materialIssueItem.materialIssue.workOrderId,
        sourceProjectId: p.materialIssueItem.materialIssue.projectId,
      })),
    }),
  }
}
