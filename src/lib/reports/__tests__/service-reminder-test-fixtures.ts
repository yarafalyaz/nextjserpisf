import type { ServiceReminderVehicleInput } from "../service-reminder-queue"

// 10:00 WIB 26 Okt 2026 = 03:00Z — now di luar tengah malam pada kedua zona.
export const SERVICE_REMINDER_NOW = new Date("2026-10-26T03:00:00.000Z")

export function serviceReminderDay(offset: number): Date {
  return new Date(Date.UTC(2026, 9, 26) + offset * 86_400_000)
}

export function serviceReminderInput(
  over: Partial<ServiceReminderVehicleInput>,
): ServiceReminderVehicleInput {
  return {
    customerVehicleId: 1,
    nextServiceDate: null,
    nextServiceKm: null,
    nextServiceNote: null,
    lastOdometerKm: null,
    vehicleIsActive: true,
    vehicleDeletedAt: null,
    plateNumber: "B 1 AA",
    vehicleName: "Avanza",
    customerId: 1,
    customerName: "Budi",
    ...over,
  }
}
