import { describe, expect, it } from "vitest"
import {
  classifyScrapLine,
  decideAbnormalScrapPosting,
  validateScrapInput,
  wipCostPoolAfterIssue,
} from "../scrap-classification"

const GATE_OFF = { abnormalScrapPostingEnabled: false, abnormalScrapExpenseAccountId: null, wipAccountId: null }
const GATE_ON_OK = { abnormalScrapPostingEnabled: true, abnormalScrapExpenseAccountId: 510105, wipAccountId: 400 }

describe("classifyScrapLine (vonis BOT 4 F-066-V P1)", () => {
  it("S1: scrap dalam allowance = normal penuh", () => {
    const c = classifyScrapLine({ issueQty: 110, plannedQty: 100, scrapQty: 8, scrapPercentSnapshot: 10, unitCost: 1000 })
    expect(c).toMatchObject({ normalQty: 8, abnormalQty: 0, normalValue: 8000, abnormalValue: 0, uncalibrated: false })
  })

  it("S2: hanya porsi lewat allowance abnormal, sen persis", () => {
    const c = classifyScrapLine({ issueQty: 110, plannedQty: 100, scrapQty: 15, scrapPercentSnapshot: 10, unitCost: 333.33 })
    expect(c.normalQty).toBe(10)
    expect(c.abnormalQty).toBe(5)
    expect(c.abnormalValue).toBe(1666.65)
  })

  it("S3: allowance 0/null = seluruh scrap abnormal + temuan kalibrasi", () => {
    for (const pct of [0, null]) {
      const c = classifyScrapLine({ issueQty: 50, plannedQty: 50, scrapQty: 3, scrapPercentSnapshot: pct, unitCost: 200 })
      expect(c).toMatchObject({ normalQty: 0, abnormalQty: 3, abnormalValue: 600, uncalibrated: true })
    }
  })

  it("baris unplanned (planned 0): allowance 0 walau persen terisi", () => {
    const c = classifyScrapLine({ issueQty: 5, plannedQty: 0, scrapQty: 2, scrapPercentSnapshot: 10, unitCost: 100 })
    expect(c).toMatchObject({ allowanceQty: 0, abnormalQty: 2 })
  })

  it("scrap 0 = bersih, bukan temuan", () => {
    const c = classifyScrapLine({ issueQty: 10, plannedQty: 10, scrapQty: 0, scrapPercentSnapshot: null, unitCost: 100 })
    expect(c).toMatchObject({ normalQty: 0, abnormalQty: 0, normalValue: 0, abnormalValue: 0 })
  })
})

describe("validateScrapInput (P4)", () => {
  it("S9: lainnya tanpa catatan ditolak; dengan catatan lolos", () => {
    expect(validateScrapInput({ issueQty: 10, scrapQty: 1, scrapReasonCode: "lainnya", scrapNote: " " })).toMatch(/catatan/)
    expect(validateScrapInput({ issueQty: 10, scrapQty: 1, scrapReasonCode: "lainnya", scrapNote: "plat retak" })).toBeNull()
  })

  it("scrap > 0 tanpa kode sah ditolak; scrap 0 tanpa kode lolos", () => {
    expect(validateScrapInput({ issueQty: 10, scrapQty: 1, scrapReasonCode: null })).toMatch(/kode alasan/)
    expect(validateScrapInput({ issueQty: 10, scrapQty: 1, scrapReasonCode: "karangan" })).toMatch(/kode alasan/)
    expect(validateScrapInput({ issueQty: 10, scrapQty: 0 })).toBeNull()
  })

  it("scrap melebihi qty baris / negatif ditolak", () => {
    expect(validateScrapInput({ issueQty: 2, scrapQty: 3, scrapReasonCode: "gagal_las" })).toMatch(/melebihi/)
    expect(validateScrapInput({ issueQty: 2, scrapQty: -1 })).toMatch(/negatif/)
  })
})

describe("decideAbnormalScrapPosting (putusan flag Lead catat-dulu)", () => {
  it("flag OFF + abnormal > 0: nol jurnal, bukan error (S4-flagOFF)", () => {
    expect(decideAbnormalScrapPosting(GATE_OFF, 5000)).toEqual({ mode: "off", journalAmount: 0 })
  })

  it("flag ON + akun terisi: posting sen persis", () => {
    expect(decideAbnormalScrapPosting(GATE_ON_OK, 1666.65)).toEqual({
      mode: "on", journalAmount: 1666.65, expenseAccountId: 510105, wipAccountId: 400,
    })
  })

  it("S4 flag ON: akun kosong = tolak (pemanggil rollback tx)", () => {
    expect(() => decideAbnormalScrapPosting({ ...GATE_ON_OK, abnormalScrapExpenseAccountId: null }, 100)).toThrow(/belum dikonfigurasi/)
    expect(() => decideAbnormalScrapPosting({ ...GATE_ON_OK, wipAccountId: null }, 100)).toThrow(/WIP/)
  })

  it("tanpa abnormal: mode off walau flag ON", () => {
    expect(decideAbnormalScrapPosting(GATE_ON_OK, 0)).toEqual({ mode: "off", journalAmount: 0 })
  })
})

describe("wipCostPoolAfterIssue (TASK-019 WIP tidak negatif)", () => {
  it("abnormal terjurnal dikeluarkan dari pool: WIP job seimbang setelah complete", () => {
    // Issue Rp1.000, abnormal terjurnal Rp300 → pool release Rp700.
    // WIP GL: Dr 1.000 − Cr abnormal 300 − Cr barang jadi 700 = 0.
    const pool = wipCostPoolAfterIssue({ previousWipCost: 0, issuedCost: 1000, abnormalPostedValue: 300 })
    expect(pool).toBe(700)
    expect(1000 - 300 - pool).toBe(0)
  })

  it("flag OFF (abnormal belum terjurnal): pool tetap gross", () => {
    expect(wipCostPoolAfterIssue({ previousWipCost: 200, issuedCost: 1000, abnormalPostedValue: 0 })).toBe(1200)
  })

  it("pool tidak pernah negatif walau abnormal melebihi sisa pool", () => {
    expect(wipCostPoolAfterIssue({ previousWipCost: 0, issuedCost: 100, abnormalPostedValue: 150 })).toBe(0)
  })
})
