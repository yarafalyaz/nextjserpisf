import {
  type WarrantyExpiryCoverageInput,
} from "../warranty-expiry-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

// Fixture bersama tes builder + tes kartu antrean garansi (F-2026-10-22-094-S):
// Sonar menandai blok salin-tempel antar berkas tes sebagai duplikasi;
// simpan sekali di sini. Hari kalender WIB tetap: 2026-10-22 — instan 05:00 WIB.
export const WARRANTY_EXPIRY_NOW = new Date("2026-10-21T22:00:00.000Z")
export const WARRANTY_EXPIRY_TODAY = getWibTodayUtcDate(WARRANTY_EXPIRY_NOW)
export const warrantyExpiryDay = (offset: number) =>
  new Date(WARRANTY_EXPIRY_TODAY.getTime() + offset * 86_400_000)

export function warrantyExpiryInput(
  overrides: Partial<WarrantyExpiryCoverageInput> = {},
): WarrantyExpiryCoverageInput {
  return {
    coverageId: 1,
    storedStatus: "active",
    expiresAt: warrantyExpiryDay(10),
    installedAt: warrantyExpiryDay(-350),
    warrantyMonths: 12,
    serialNumber: "SN-1",
    mileageLimitKm: null,
    customerVehicleId: 11,
    plateNumber: "B 1234 CD",
    vehicleName: "Kendaraan Uji",
    vehicleIsActive: true,
    vehicleDeletedAt: null,
    lastOdometerKm: null,
    customerId: 21,
    customerName: "Pelanggan Uji",
    customerPhone: "081234567890",
    itemId: 31,
    itemName: "Item Uji",
    itemSku: "SKU-1",
    workOrderId: 41,
    claimStatuses: [],
    ...overrides,
  }
}
