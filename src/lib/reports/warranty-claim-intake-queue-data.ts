/**
 * Loader read-only antrean klaim garansi intake mengendap
 * (F-2026-10-27-076-S, PUTUSAN LEAD Q-WIQ-1..6).
 *
 * Fail-closed `view_warranty_claims` SEBELUM query (Q-WIQ-5, nol key baru).
 * Satu query massal WarrantyClaim status `intake` beserta cakupan+item,
 * kendaraan+pelanggan lewat relasi Prisma, nama pembuat lewat satu query
 * User massal — tanpa N+1. Telepon pelanggan TIDAK PERNAH dipilih
 * (Q-WIQ-6). Baca-saja: loader hanya `findMany` (BR-WIQ-09, AC-WIQ-B5).
 * Populasi/tingkat/urutan di builder murni `warranty-claim-intake-queue.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildWarrantyIntakeQueue,
  type WarrantyIntakeQueue,
} from "@/lib/reports/warranty-claim-intake-queue"

export interface WarrantyIntakeLoaderOptions {
  now?: Date
}

export async function getWarrantyIntakeQueue(
  options: WarrantyIntakeLoaderOptions = {},
): Promise<WarrantyIntakeQueue> {
  await requirePermission("view_warranty_claims")

  const claims = await prisma.warrantyClaim.findMany({
    where: { status: "intake" },
    select: {
      id: true,
      status: true,
      reportedAt: true,
      odometerKm: true,
      complaint: true,
      createdBy: true,
      coverageId: true,
      customerVehicleId: true,
      coverage: {
        select: {
          status: true,
          expiresAt: true,
          serialNumber: true,
          itemId: true,
          item: { select: { name: true, sku: true } },
        },
      },
      customerVehicle: {
        select: {
          plateNumber: true,
          customer: { select: { id: true, name: true } },
          vehicle: { select: { name: true } },
        },
      },
    },
    orderBy: [{ reportedAt: "asc" }, { id: "asc" }],
  })

  const creatorIds = [
    ...new Set(claims.map((c) => c.createdBy).filter((id): id is number => id != null)),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : []
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]))

  return buildWarrantyIntakeQueue(
    claims.map((claim) => ({
      claimId: claim.id,
      status: claim.status,
      reportedAt: claim.reportedAt,
      odometerKm: claim.odometerKm,
      complaint: claim.complaint,
      createdByName:
        claim.createdBy != null ? (creatorNameById.get(claim.createdBy) ?? null) : null,
      coverageId: claim.coverageId,
      coverageStatus: claim.coverage.status,
      coverageExpiresAt: claim.coverage.expiresAt,
      serialNumber: claim.coverage.serialNumber,
      itemId: claim.coverage.itemId,
      itemName: claim.coverage.item.name,
      itemSku: claim.coverage.item.sku,
      customerVehicleId: claim.customerVehicleId,
      plateNumber: claim.customerVehicle.plateNumber,
      vehicleName: claim.customerVehicle.vehicle.name,
      customerId: claim.customerVehicle.customer.id,
      customerName: claim.customerVehicle.customer.name,
    })),
    { now: options.now },
  )
}
