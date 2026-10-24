import { describe, expect, it } from "vitest"

import { creditOverLimitLabel } from "../customer-receivables"
import { groupReceivablesByVehicle, UNASSIGNED_VEHICLE_LABEL } from "../receivables-by-vehicle-data"

describe("creditOverLimitLabel (F-2026-10-20-21a)", () => {
  it("states over-by, limit and outstanding in plain money", () => {
    expect(
      creditOverLimitLabel({ customerId: 1, customerName: "CV A", creditLimit: 1000, outstanding: 1250, overdue: 0, invoiceCount: 2 }),
    ).toContain("250,00")
  })
  it("is null within limit, and limit 0 means no limit configured", () => {
    expect(creditOverLimitLabel({ customerId: 1, customerName: "A", creditLimit: 1000, outstanding: 1000, overdue: 0, invoiceCount: 1 })).toBeNull()
    expect(creditOverLimitLabel({ customerId: 1, customerName: "B", creditLimit: 0, outstanding: 999999, overdue: 0, invoiceCount: 9 })).toBeNull()
  })
})

describe("groupReceivablesByVehicle (F-2026-10-20-22)", () => {
  it("groups by plate, skips settled invoices, buckets by days overdue", () => {
    const now = new Date(2026, 9, 20)
    const rows = groupReceivablesByVehicle(
      [
        { plateLabel: "B 1234 ABC", grandTotal: 100.1, paidAmount: 0.2, dueDate: new Date(2026, 8, 10) },
        { plateLabel: "B 1234 ABC", grandTotal: 50, paidAmount: 50, dueDate: new Date(2026, 8, 10) },
        { plateLabel: null, grandTotal: 75, paidAmount: 0, dueDate: null },
      ],
      now,
    )
    expect(rows).toHaveLength(2)
    const plate = rows.find((r) => r.plateLabel === "B 1234 ABC")!
    expect(plate.outstanding).toBe(99.9)
    expect(plate.invoiceCount).toBe(1)
    expect(plate.buckets["31–60 Hari"]).toBe(99.9)
    expect(rows.find((r) => r.plateLabel === UNASSIGNED_VEHICLE_LABEL)?.outstanding).toBe(75)
  })
})

describe("groupReceivablesByVehicle returnCredit (F-104-V)", () => {
  it("returnCredit kurangi sisa per kendaraan", () => {
    const rows = groupReceivablesByVehicle(
      [{ plateLabel: "B 1 AA", grandTotal: 1000, paidAmount: 200, returnCreditAmount: 300, dueDate: null }],
      new Date(2026, 9, 20),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].outstanding).toBe(500)
  })
})
