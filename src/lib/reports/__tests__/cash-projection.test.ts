import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { projectCash, buildReceivableProjectionItems, buildPayableProjectionItems, summarizeOpenCommitments, PAYROLL_PROJECTION_STATUSES, sumProjectionPayrollNet } from "../cash-projection"

describe("projectCash", () => {
  const from = new Date(2026, 9, 1) // Oct 2026

  it("buckets flows into the right month and accumulates closing", () => {
    const rows = projectCash(
      1000,
      from,
      3,
      [
        { dueDate: new Date(2026, 9, 10), amount: 500 }, // Oct
        { dueDate: new Date(2026, 10, 5), amount: 300 }, // Nov
      ],
      [
        { dueDate: new Date(2026, 9, 20), amount: 200 }, // Oct
        { dueDate: new Date(2026, 11, 1), amount: 100 }, // Dec
      ],
    )

    expect(rows.map((r) => r.month)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(rows[0]).toMatchObject({ label: "Oktober 2026", inflow: 500, outflow: 200, net: 300, closing: 1300 })
    expect(rows[1]).toMatchObject({ inflow: 300, outflow: 0, net: 300, closing: 1600 })
    expect(rows[2]).toMatchObject({ inflow: 0, outflow: 100, net: -100, closing: 1500 })
  })

  it("ignores items outside the projected window", () => {
    const rows = projectCash(0, from, 1, [{ dueDate: new Date(2026, 11, 1), amount: 999 }], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].closing).toBe(0)
  })

  it("returns a flat line when there are no flows", () => {
    const rows = projectCash(250, from, 2, [], [])
    expect(rows.map((r) => r.closing)).toEqual([250, 250])
  })

  it("regression round 17: receivable items are NET of return credit", () => {
    const due = new Date(2026, 9, 15)
    const items = buildReceivableProjectionItems(
      [
        { id: 1, dueDate: due, grandTotal: 100, paidAmount: 0 },
        { id: 2, dueDate: due, grandTotal: 100, paidAmount: 25 },
        { id: 3, dueDate: null, grandTotal: 100, paidAmount: 0 },
      ],
      new Map([
        [1, 100],
        [2, 40],
      ]),
    )
    expect(items).toEqual([{ dueDate: due, amount: 35 }])
  })

  it("payable items are NET of withholding (F-48): bruto overstates outflow", () => {
    const due = new Date(2026, 9, 15)
    const items = buildPayableProjectionItems([
      // Tagihan ber-PPh: kas keluar nyata = 1.000.000 - 20.000 - 400.000.
      { dueDate: due, grandTotal: 1_000_000, withholdingAmount: 20_000, paidAmount: 400_000 },
      // Sudah lunas neto -> dibuang (sisa <= 0).
      { dueDate: due, grandTotal: 500_000, withholdingAmount: 10_000, paidAmount: 490_000 },
      // Tanpa jatuh tempo -> dibuang (pemanggil memutuskan perlakuan lain).
      { dueDate: null, grandTotal: 700_000, withholdingAmount: 0, paidAmount: 0 },
    ])
    expect(items).toEqual([{ dueDate: due, amount: 580_000 }])
  })

  it("payable items without withholding keep grandTotal - paidAmount sen-exact", () => {
    const due = new Date(2026, 9, 15)
    const items = buildPayableProjectionItems([
      { dueDate: due, grandTotal: 100.1, withholdingAmount: 0, paidAmount: 100.07 },
    ])
    expect(items).toEqual([{ dueDate: due, amount: 0.03 }])
  })

  it("F-48(b): summarizeOpenCommitments hitung PO terbuka sisa + payroll, abaikan PO selesai", () => {
    const r = summarizeOpenCommitments({
      purchaseOrders: [
        { status: "partial_received", items: [{ qty: 10, receivedQty: 4, unitPrice: 100 }] },
        { status: "received", items: [{ qty: 5, receivedQty: 5, unitPrice: 100 }] },
      ],
      payrollPeriod: "2026-10",
      payrollNetTotal: 5000,
    })
    expect(r).toMatchObject({ openPurchaseOrderCount: 1, openPurchaseAmount: 600, estimatedPayrollAmount: 5000, total: 5600 })
  })

  it("F-48(b): summarizeOpenCommitments kosong tanpa PO terbuka/payroll", () => {
    const r = summarizeOpenCommitments({ purchaseOrders: [], payrollPeriod: null, payrollNetTotal: 0 })
    expect(r).toEqual({ openPurchaseOrderCount: 0, openPurchaseAmount: 0, payrollPeriod: null, estimatedPayrollAmount: 0, total: 0 })
  })

  it("putaran 41: status basis estimasi gaji hanya approved/paid (filter positif)", () => {
    expect([...PAYROLL_PROJECTION_STATUSES]).toEqual(["approved", "paid"])
  })

  it("putaran 41: slip asal terkoreksi tidak terhitung bersama koreksinya", () => {
    // Slip asal tetap paid (jurnal di-reverse); koreksi mengemban angka penuh.
    const total = sumProjectionPayrollNet(
      [
        { id: 1, netSalary: 1_000_000 },
        { id: 2, netSalary: 1_200_000 },
      ],
      new Set([1]),
    )
    expect(total).toBe(1_200_000)
  })

  it("putaran 41: halaman proyeksi-kas memakai filter positif, bukan not-cancelled", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/laporan/proyeksi-kas/[[...segments]]/page.tsx"),
      "utf8",
    )
    expect(page).not.toContain("not: 'cancelled'")
    expect(page).toContain("PAYROLL_PROJECTION_STATUSES")
    expect(page).toContain("sumProjectionPayrollNet")
  })

  it("putaran 41: agregat jurnal pusat-laba & multi-periode mengecualikan jurnal terhapus lunak", () => {
    // Kedua halaman menghitung groupBy jurnal langsung (bukan loader), jadi
    // guard sumber ini mencegah deletedAt diam-diam hilang dari filter lagi.
    for (const file of [
      "src/app/(dashboard)/laporan/pusat-laba/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/multi-periode/[[...segments]]/page.tsx",
    ]) {
      const page = readFileSync(resolve(process.cwd(), file), "utf8")
      expect(page).toContain("deletedAt: null")
    }
  })
})
