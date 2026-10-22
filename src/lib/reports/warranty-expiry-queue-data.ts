/**
 * Loader read-only antrean garansi segera berakhir
 * (F-2026-10-22-094-S, Q-WX-5 fisik BOT 3).
 *
 * Satu query massal WarrantyCoverage (status tersimpan active/expired)
 * beserta kendaraan/pelanggan/item/klaim lewat relasi Prisma — tanpa N+1.
 * Hitungan ember/penanda/urutan di builder murni `warranty-expiry-queue.ts`.
 * Indeks `expiresAt` existing cukup tahap 1 (Q-WX-5). HARAM menulis
 * coverage: loader ini hanya `findMany` (AC-WX-2).
 *
 * Izin (Q-WX-1, PUTUSAN BOT 1): permukaan pemanggil menegakkan
 * requirePermission lebih dulu — kartu halaman Klaim Garansi
 * `view_warranty_claims`, halaman laporan `view_reports`. Loader menerima
 * scope EKSPLISIT dari permukaan itu, bukan menebak izin sendiri:
 * - "claims_page": telepon pelanggan ikut hasil (konteks kerja staf
 *   garansi + tombol WA Q-WX-4).
 * - "report": telepon TIDAK PERNAH dipilih dari DB; nama + plat saja.
 * Scope lain = fail-closed (builder melempar error).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWarrantyExpiryQueue,
  type WarrantyExpiryQueue,
  type WarrantyExpiryScope,
} from "@/lib/reports/warranty-expiry-queue"

export type { WarrantyExpiryScope }

export interface WarrantyExpiryLoaderOptions {
  now?: Date
  windowAheadDays?: number
  windowPastDays?: number
}

export async function getWarrantyExpiryQueue(
  scope: WarrantyExpiryScope,
  options: WarrantyExpiryLoaderOptions = {},
): Promise<WarrantyExpiryQueue> {
  const includePhone = scope === "claims_page"

  const coverages = await prisma.warrantyCoverage.findMany({
    where: { status: { in: ["active", "expired"] } },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      installedAt: true,
      warrantyMonths: true,
      serialNumber: true,
      mileageLimitKm: true,
      customerVehicleId: true,
      itemId: true,
      workOrderId: true,
      customerVehicle: {
        select: {
          plateNumber: true,
          isActive: true,
          deletedAt: true,
          lastOdometerKm: true,
          customer: { select: { id: true, name: true, phone: includePhone } },
          vehicle: { select: { name: true } },
        },
      },
      item: { select: { name: true, sku: true } },
      claims: { select: { status: true }, orderBy: [{ id: "asc" }] },
    },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  })

  return buildWarrantyExpiryQueue(
    coverages.map((coverage) => ({
      coverageId: coverage.id,
      storedStatus: coverage.status,
      expiresAt: coverage.expiresAt,
      installedAt: coverage.installedAt,
      warrantyMonths: coverage.warrantyMonths,
      serialNumber: coverage.serialNumber,
      mileageLimitKm: coverage.mileageLimitKm,
      customerVehicleId: coverage.customerVehicleId,
      plateNumber: coverage.customerVehicle.plateNumber,
      vehicleName: coverage.customerVehicle.vehicle.name,
      vehicleIsActive: coverage.customerVehicle.isActive,
      vehicleDeletedAt: coverage.customerVehicle.deletedAt,
      lastOdometerKm: coverage.customerVehicle.lastOdometerKm,
      customerId: coverage.customerVehicle.customer.id,
      customerName: coverage.customerVehicle.customer.name,
      customerPhone: includePhone ? (coverage.customerVehicle.customer.phone ?? null) : null,
      itemId: coverage.itemId,
      itemName: coverage.item.name,
      itemSku: coverage.item.sku,
      workOrderId: coverage.workOrderId,
      claimStatuses: coverage.claims.map((claim) => claim.status),
    })),
    {
      scope,
      now: options.now,
      windowAheadDays: options.windowAheadDays,
      windowPastDays: options.windowPastDays,
    },
  )
}
