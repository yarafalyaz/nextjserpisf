/**
 * Loader read-only riwayat part terpasang per kendaraan (F-2026-10-21-024).
 *
 * Memuat tiga sumber existing lalu menyerahkan seluruh keputusan ke builder
 * murni `buildInstalledParts`:
 *   1. WarrantyCoverage kendaraan ini (semua status — revoked/expired tetap
 *      ditampilkan sebagai riwayat, ditandai builder),
 *   2. MaterialIssue completed dari WorkOrder kendaraan ini (menutup part
 *      berserial non-garansi), berikut nama/SKU item,
 *   3. WarrantyClaim kendaraan ini untuk penanda penggantian (replace).
 *
 * Kendaraan tanpa WO/coverage menghasilkan daftar kosong — bukan error.
 * Read-only: tanpa migrasi, tanpa mutasi, tanpa jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildInstalledParts,
  type InstalledParts,
} from "./installed-parts"

export async function getInstalledParts(
  customerVehicleId: number,
  now: Date = new Date(),
): Promise<InstalledParts & { customerVehicleId: number }> {
  const [coverages, workOrders, claims] = await Promise.all([
    prisma.warrantyCoverage.findMany({
      where: { customerVehicleId },
      select: {
        id: true, workOrderId: true, itemId: true, serialNumber: true,
        installedAt: true, expiresAt: true, status: true,
        item: { select: { name: true, sku: true } },
      },
      orderBy: [{ installedAt: "desc" }, { id: "desc" }],
    }),
    prisma.workOrder.findMany({
      where: { customerVehicleId },
      select: { id: true },
    }),
    prisma.warrantyClaim.findMany({
      where: { customerVehicleId },
      select: {
        id: true, coverageId: true, status: true,
        resolutionType: true, repairWorkOrderId: true,
      },
      orderBy: { id: "asc" },
    }),
  ])

  const workOrderIds = workOrders.map((w) => w.id)
  const issues =
    workOrderIds.length === 0
      ? []
      : await prisma.materialIssue.findMany({
          where: { workOrderId: { in: workOrderIds }, status: "completed" },
          select: {
            workOrderId: true, date: true, status: true,
            items: {
              select: { itemId: true, serialNumbers: true },
            },
          },
          orderBy: [{ date: "desc" }, { id: "desc" }],
        })
  const issueItemIds = issues.flatMap((mi) => mi.items.map((l) => l.itemId))
  const itemIds = [...new Set([...coverages.map((c) => c.itemId), ...issueItemIds])]
  const items = itemIds.length === 0 ? [] : await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true, sku: true },
  })
  const itemNames = new Map(items.map((i) => [i.id, i]))

  return {
    customerVehicleId,
    ...buildInstalledParts(
      {
        coverages: coverages.map((c) => ({
          id: c.id,
          workOrderId: c.workOrderId,
          itemId: c.itemId,
          itemName: c.item.name,
          itemSku: c.item.sku,
          serialNumber: c.serialNumber,
          installedAt: c.installedAt,
          expiresAt: c.expiresAt,
          status: c.status,
        })),
        issues: issues.map((mi) => ({
          workOrderId: mi.workOrderId ?? 0,
          date: mi.date,
          status: mi.status,
          lines: mi.items.map((line) => ({
            itemId: line.itemId,
            itemName: itemNames.get(line.itemId)?.name ?? "",
            itemSku: itemNames.get(line.itemId)?.sku ?? null,
            serialNumbers: line.serialNumbers,
          })),
        })),
        claims,
      },
      now,
    ),
  }
}
