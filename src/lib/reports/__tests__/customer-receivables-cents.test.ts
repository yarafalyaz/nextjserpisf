import { describe, it, expect } from "vitest"
import { aggregateCustomerReceivables } from "../ledger-cash-data"

describe("aggregateCustomerReceivables (presisi sen)", () => {
  it("outstanding per faktur dibulatkan sen sebelum dijumlah (bukan float mentah)", () => {
    // Sisa per faktur 2,24 (di atas toleransi lunas Rp1) supaya baris tidak
    // dibuang oleh FIN-BR-006; yang diuji adalah akumulasi sennya.
    const invoices = Array.from({ length: 17 }, () => ({
      customerId: 1, customerName: "CV A", creditLimit: 0, grandTotal: 1002.37, paidAmount: 1000.13, dueDate: null,
    }))
    const buckets = aggregateCustomerReceivables(invoices)
    // Per faktur 1002,37 − 1000,13 = 2,24; 17x persis 38,08.
    // Float mentah: 17x(1002.37-1000.13) terakumulasi 38.080000000000155.
    expect(buckets).toHaveLength(1)
    expect(buckets[0].outstanding).toBe(38.08)
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

  it("faktur jatuh tempo HARI INI tidak dihitung lewat jatuh tempo", () => {
    // dueDate jurnal = tengah malam UTC hari WIB (07.00 WIB). Dulu perbandingan
    // `dueDate < now` membuat faktur ini berubah "lewat" pukul 07.00, sementara
    // aging menempatkannya di "Belum Jatuh Tempo".
    const dueToday = new Date("2026-11-04T00:00:00Z")
    const invoice = {
      customerId: 4,
      customerName: "CV D",
      creditLimit: 0,
      grandTotal: 2_500_000,
      paidAmount: 0,
      dueDate: dueToday,
    }

    const morning = aggregateCustomerReceivables([invoice], new Date("2026-11-03T22:00:00Z"))
    const noon = aggregateCustomerReceivables([invoice], new Date("2026-11-04T05:00:00Z"))
    const tomorrow = aggregateCustomerReceivables([invoice], new Date("2026-11-04T22:00:00Z"))

    expect(morning[0].overdue).toBe(0)
    expect(noon[0].overdue).toBe(0)
    expect(tomorrow[0].overdue).toBe(2_500_000)
  })
})

describe("aggregateCustomerReceivables returnCredit (F-104-V)", () => {
  it("returnCredit kurangi outstanding; lunas oleh retur tidak tampil", () => {
    const buckets = aggregateCustomerReceivables([
      { customerId: 9, customerName: "CV R", creditLimit: 0, grandTotal: 1000, paidAmount: 200, returnCreditAmount: 300, dueDate: null },
      { customerId: 9, customerName: "CV R", creditLimit: 0, grandTotal: 500, paidAmount: 0, returnCreditAmount: 500, dueDate: null },
    ])
    expect(buckets).toHaveLength(1)
    expect(buckets[0].outstanding).toBe(500)
    expect(buckets[0].invoiceCount).toBe(1)
  })
})
