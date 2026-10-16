import { describe, expect, it } from "vitest"

import {
  buildPostDatedCheques,
  daysUntilDue,
  postDatedChequesSummary,
  type ChequeInput,
} from "@/lib/reports/post-dated-cheques"

const AS_OF = new Date(2026, 9, 15)

function cheque(overrides: Partial<ChequeInput> = {}): ChequeInput {
  return {
    documentNo: "CHQ-0001",
    type: "giro",
    direction: "in",
    number: "G-100",
    party: "PT Pelanggan",
    accountLabel: "110102 Bank",
    amount: 5_000_000,
    dueDate: new Date(2026, 10, 15),
    status: "pending",
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildPostDatedCheques>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice"
        ? row.text
        : row.kind === "group"
          ? row.label
          : row.kind === "total"
            ? `${row.label} ${row.cells.join(" | ")}`
            : row.cells.join(" | "),
    )
    .join("\n")
}

function docNos(result: ReturnType<typeof buildPostDatedCheques>) {
  return result.table.rows
    .filter((row) => row.kind === "data")
    .map((row) => (row.kind === "data" ? row.cells[1] : ""))
}

describe("daysUntilDue", () => {
  it("positif saat belum jatuh tempo, negatif saat sudah lewat", () => {
    expect(daysUntilDue(new Date(2026, 9, 25), AS_OF)).toBe(10)
    expect(daysUntilDue(new Date(2026, 9, 5), AS_OF)).toBe(-10)
    expect(daysUntilDue(AS_OF, AS_OF)).toBe(0)
  })
})

describe("buildPostDatedCheques", () => {
  it("memisahkan belum jatuh tempo dari yang sudah jatuh tempo belum dicairkan", () => {
    const result = buildPostDatedCheques({
      cheques: [
        cheque({ documentNo: "A", dueDate: new Date(2026, 10, 15) }),
        cheque({ documentNo: "B", dueDate: new Date(2026, 9, 5) }),
      ],
      asOf: AS_OF,
    })

    expect(result.notDue.count).toBe(1)
    expect(result.overdue.count).toBe(1)
    expect(texts(result)).toContain("Belum Jatuh Tempo (1)")
    expect(texts(result)).toContain("Jatuh Tempo, Belum Dicairkan (1)")
    expect(docNos(result).sort()).toEqual(["A", "B"])
  })

  it("jatuh tempo hari ini dihitung sebagai sudah jatuh tempo", () => {
    const result = buildPostDatedCheques({ cheques: [cheque({ dueDate: new Date(2026, 9, 15) })], asOf: AS_OF })

    expect(result.notDue.count).toBe(0)
    expect(result.overdue.count).toBe(1)
  })

  it("mengabaikan giro yang sudah cair atau dibatalkan", () => {
    const result = buildPostDatedCheques({
      cheques: [
        cheque({ status: "cleared" }),
        cheque({ status: "cancelled", documentNo: "B" }),
        cheque({ status: "pending", documentNo: "C" }),
      ],
      asOf: AS_OF,
    })

    expect(result.notDue.count + result.overdue.count).toBe(1)
    expect(docNos(result)).toEqual(["C"])
  })

  it("membedakan 'tidak ada giro mundur' dari 'belum ada giro dicatat'", () => {
    const kosong = buildPostDatedCheques({ cheques: [], asOf: AS_OF })
    const hanyaCair = buildPostDatedCheques({ cheques: [cheque({ status: "cleared" })], asOf: AS_OF })

    expect(texts(kosong)).toContain("Belum ada giro/cek berstatus")
    expect(postDatedChequesSummary(kosong)).toContain("Tidak ada giro/cek belum cair")
    expect(hanyaCair.notDue.count).toBe(0)
  })

  it("menjumlahkan nominal per kelompok", () => {
    const result = buildPostDatedCheques({
      cheques: [
        cheque({ dueDate: new Date(2026, 10, 15), amount: 5_000_000 }),
        cheque({ documentNo: "B", dueDate: new Date(2026, 10, 20), amount: 3_000_000 }),
      ],
      asOf: AS_OF,
    })

    expect(result.notDue.amount).toBe(8_000_000)
    expect(postDatedChequesSummary(result)).toContain("Belum jatuh tempo")
  })
})
