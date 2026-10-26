/**
 * Loader read-only antrean pengingat servis berkala per kendaraan
 * (F-2026-10-25-021-S tahap 1).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (usulan Q-SV-2, pola sales-price-history-data.ts); tanpa key baru.
 * Halaman pemanggil menegakkannya juga sebelum loader.
 *
 * Anti-N+1 (AC-SV-B6): satu query massal CustomerVehicle beserta
 * pelanggan + tipe kendaraan lewat relasi Prisma. Permukaan laporan
 * TIDAK PERNAH memilih kolom telepon pelanggan (BR-SV-06) — select di
 * bawah memang tanpa `phone`, bukan dipilih lalu dibuang.
 *
 * Baca-saja mutlak (AC-SV-B5): loader ini hanya `findMany`; antrean
 * tidak menulis jadwal/status kendaraan. Pencatatan jadwal = aksi
 * master terpisah di vehicle.actions.ts (edit_customers, BR-SV-08).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildServiceReminderQueue,
  type ServiceReminderQueue,
} from "@/lib/reports/service-reminder-queue"

export interface ServiceReminderLoaderOptions {
  now?: Date
  windowAheadDays?: number
  kmAheadThreshold?: number
}

export async function getServiceReminderQueue(
  options: ServiceReminderLoaderOptions = {},
): Promise<ServiceReminderQueue> {
  await requirePermission("view_reports")

  const vehicles = await prisma.customerVehicle.findMany({
    select: {
      id: true,
      nextServiceDate: true,
      nextServiceKm: true,
      nextServiceNote: true,
      lastOdometerKm: true,
      isActive: true,
      deletedAt: true,
      plateNumber: true,
      customer: { select: { id: true, name: true } },
      vehicle: { select: { name: true } },
    },
    orderBy: [{ id: "asc" }],
  })

  return buildServiceReminderQueue(
    vehicles.map((v) => ({
      customerVehicleId: v.id,
      nextServiceDate: v.nextServiceDate,
      nextServiceKm: v.nextServiceKm,
      nextServiceNote: v.nextServiceNote,
      lastOdometerKm: v.lastOdometerKm,
      vehicleIsActive: v.isActive,
      vehicleDeletedAt: v.deletedAt,
      plateNumber: v.plateNumber,
      vehicleName: v.vehicle.name,
      customerId: v.customer.id,
      customerName: v.customer.name,
    })),
    {
      now: options.now,
      windowAheadDays: options.windowAheadDays,
      kmAheadThreshold: options.kmAheadThreshold,
    },
  )
}
