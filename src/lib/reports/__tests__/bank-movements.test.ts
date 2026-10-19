import { describe, expect, it } from "vitest"

import { buildBankMovements, type BankMovementInput } from "@/lib/reports/bank-movements"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function movement(over: Partial<BankMovementInput> = {}): BankMovementInput {
  return {
    accountId: 1,
    accountCode: "1101",
    accountName: "Bank BCA",
    date: new Date("2026-10-05T00:00:00"),
    kind: "Penerimaan",
    documentNo: "PAY-0001",
    counterparty: "PT Maju",
    amount: 1_000_000,
    ...over,
  }
}

describe("buildBankMovements", () => {
  it("meringkas penerimaan, pengeluaran, dan arus bersih per rekening", () => {
    const result = buildBankMovements({
      movements: [
        movement(),
        movement({ documentNo: "PAY-0002", amount: 500_000 }),
        movement({
          accountId: 2,
          accountCode: "1102",
          accountName: "Bank Mandiri",
          kind: "Pengeluaran",
          documentNo: "VP-0001",
          counterparty: "CV Sumber",
          amount: 300_000,
        }),
      ],
      start: period.start,
      end: period.end,
    })

    expect(result.summary).toEqual([
      {
        accountKey: "1",
        label: "1101 Bank BCA",
        inflow: 1_500_000,
        outflow: 0,
        net: 1_500_000,
        count: 2,
      },
      {
        accountKey: "2",
        label: "1102 Bank Mandiri",
        inflow: 0,
        outflow: 300_000,
        net: -300_000,
        count: 1,
      },
    ])

    expect(result.totals).toEqual({ inflow: 1_500_000, outflow: 300_000, net: 1_200_000, count: 3 })

    const total = result.summaryTable.rows.find((row) => row.kind === "total")
    expect(total?.cells).toEqual(["", "1.500.000", "300.000", "1.200.000", "3"])
    expect(total?.grand).toBe(true)
  })

  it("menampilkan transaksi tanpa rekening sebagai kelompok tersendiri, bukan dibuang", () => {
    const result = buildBankMovements({
      movements: [movement(), movement({ accountId: null, accountCode: null, accountName: null, amount: 250_000 })],
      start: period.start,
      end: period.end,
    })

    const label = result.summary.find((row) => row.accountKey === "__tanpa_rekening__")
    expect(label).toBeTruthy()
    expect(label?.label).toBe("Tanpa rekening")
    expect(label?.inflow).toBe(250_000)
    expect(result.hasUnassigned).toBe(true)

    // Tanpa rekening diletakkan paling akhir — ia anomali, bukan rekening.
    expect(result.summary.at(-1)?.accountKey).toBe("__tanpa_rekening__")
    // Dan totalnya tetap mencakup transaksi itu, supaya tidak ada selisih tak jelas.
    expect(result.totals.inflow).toBe(1_250_000)

    const notices = result.summaryTable.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("belum dipetakan ke rekening"))).toBe(true)
  })

  it("mengabaikan transaksi di luar periode", () => {
    const result = buildBankMovements({
      movements: [movement({ date: new Date("2026-09-30T00:00:00") })],
      start: period.start,
      end: period.end,
    })
    expect(result.totals.count).toBe(0)
    expect(result.summary).toEqual([])
  })

  it("periode tanpa transaksi menghasilkan catatan di kedua tabel", () => {
    const result = buildBankMovements({ movements: [], start: period.start, end: period.end })

    const summaryNotices = result.summaryTable.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    const detailNotices = result.detailTable.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(summaryNotices.some((text) => text.includes("Tidak ada penerimaan atau pembayaran"))).toBe(true)
    expect(detailNotices.some((text) => text.includes("Tidak ada transaksi bank"))).toBe(true)
  })

  it("rincian memuat tanggal, dokumen, jenis, lawan transaksi, nilai, dan rekening", () => {
    const result = buildBankMovements({
      movements: [
        movement({
          kind: "Pengeluaran",
          documentNo: "VP-0009",
          counterparty: "CV Sumber",
          amount: 750_000,
          accountId: 3,
          accountCode: "1103",
          accountName: "Kas Kecil",
          date: new Date("2026-10-20T00:00:00"),
        }),
      ],
      start: period.start,
      end: period.end,
    })

    const row = result.detailTable.rows.find((row) => row.kind === "data")
    expect(row?.cells).toEqual([
      "20 Okt 2026",
      "VP-0009",
      "Pengeluaran",
      "CV Sumber",
      "750.000",
      "1103 Kas Kecil",
    ])
  })
})

describe("buildBankMovements presisi sen", () => {
  it("tidak melayang saat menjumlah sen berulang (3 x 10.000.000,10)", () => {
    const result = buildBankMovements({
      movements: [
        movement({ documentNo: "PAY-A", amount: 10_000_000.1 }),
        movement({ documentNo: "PAY-B", amount: 10_000_000.1 }),
        movement({ documentNo: "PAY-C", amount: 10_000_000.1 }),
        movement({ documentNo: "VP-A", kind: "Pengeluaran", amount: 0.1 }),
        movement({ documentNo: "VP-B", kind: "Pengeluaran", amount: 0.2 }),
      ],
      start: period.start,
      end: period.end,
    })
    expect(result.summary[0]?.inflow).toBe(30_000_000.3)
    expect(result.summary[0]?.outflow).toBe(0.3)
    expect(result.summary[0]?.net).toBe(30_000_000)
    expect(result.totals.inflow).toBe(30_000_000.3)
    expect(result.totals.outflow).toBe(0.3)
    expect(result.totals.net).toBe(30_000_000)
  })
})
