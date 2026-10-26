import type { DeliveredUnbilledInput } from "@/lib/reports/delivered-unbilled"

/** Fixture bersama tes konsumen F-2026-10-26-058-S (hindari duplikasi Sonar). */
export function deliveredUnbilledInput(
  over: Partial<DeliveredUnbilledInput> = {},
): DeliveredUnbilledInput {
  return {
    salesOrderId: 1,
    slug: "so-0001",
    documentNo: "SO-0001",
    status: "confirmed",
    deletedAt: null,
    date: new Date(Date.UTC(2026, 9, 20)),
    customerName: "PT Sinar Abadi",
    lines: [{ lineId: 11, deliveredQty: 10, unitPrice: 100_000 }],
    deliveries: [
      {
        status: "delivered",
        date: new Date(Date.UTC(2026, 9, 24)),
        confirmedAt: new Date(Date.UTC(2026, 9, 24)),
        deliveredAt: new Date(Date.UTC(2026, 9, 24)),
        deliveredQty: 10,
      },
    ],
    invoices: [],
    ...over,
  }
}
