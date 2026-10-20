import { describe, it, expect } from "vitest"
import { aggregateCustomerReceivables } from "../ledger-cash-data"

describe("aggregateCustomerReceivables (presisi sen)", () => {
  it("outstanding per faktur dibulatkan sen sebelum dijumlah (bukan float mentah)", () => {
    const invoices = Array.from({ length: 17 }, () => ({
      customerId: 1, customerName: "CV A", creditLimit: 0, grandTotal: 0.37, paidAmount: 0.13, dueDate: null,
    }))
    const buckets = aggregateCustomerReceivables(invoices)
    // Per faktur 0.37 - 0.13 = 0.24; 17x persis 4.08.
    // Float mentah: 17x(0.37-0.13) terakumulasi 4.080000000000002.
    expect(buckets).toHaveLength(1)
    expect(buckets[0].outstanding).toBe(4.08)
    expect(buckets[0].invoiceCount).toBe(17)
  })

  it("faktur lunas persis (selisih float di bawah sen) tidak tampil sebagai sisa", () => {
    // 0.30 - 0.10 - 0.20 dalam float mentah menyisakan residu; di sen = 0.
    const buckets = aggregateCustomerReceivables([
      { customerId: 2, customerName: "CV B", creditLimit: 0, grandTotal: 0.3, paidAmount: 0.3, dueDate: null },
      { customerId: 2, customerName: "CV B", creditLimit: 0, grandTotal: 100.1, paidAmount: 100.1, dueDate: null },
    ])
    expect(buckets).toHaveLength(0)
  })

  it("overdue hanya dari faktur lewat jatuh tempo, presisi sen", () => {
    const past = new Date(2020, 0, 1)
    const buckets = aggregateCustomerReceivables(
      [
        { customerId: 3, customerName: "CV C", creditLimit: 5000, grandTotal: 333.33, paidAmount: 111.11, dueDate: past },
        { customerId: 3, customerName: "CV C", creditLimit: 5000, grandTotal: 10, paidAmount: 0, dueDate: null },
      ],
      new Date(2020, 0, 2),
    )
    expect(buckets[0].outstanding).toBe(232.22)
    expect(buckets[0].overdue).toBe(222.22)
  })
})
