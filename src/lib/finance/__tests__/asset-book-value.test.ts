import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"

import { journalBookValue, type AssetJournalInput } from "@/lib/finance/asset-book-value"

const FIXED = 10
const ACCUM = 20
const IMPAIR = 30
const SURPLUS = 40
const CASH = 50

const accounts = {
  fixedAssetAccountId: FIXED,
  accumulatedDepreciationAccountId: ACCUM,
  accumulatedImpairmentAccountId: IMPAIR,
}

function journals(): AssetJournalInput[] {
  return [
    {
      referenceType: "ASSET_ACQUISITION",
      lines: [{ accountId: FIXED, debit: 120_000_000, credit: 0 }],
    },
    {
      referenceType: "ASSET_DEPRECIATION_202601",
      lines: [{ accountId: ACCUM, debit: 0, credit: 20_000_000 }],
    },
  ]
}

describe("journalBookValue — jurnal peristiwa ASSET_CHANGE_EVENT", () => {
  it("revaluasi naik: bruto & buku ikut jurnal peristiwa (130jt, bukan 100jt)", () => {
    const input = [
      ...journals(),
      {
        referenceType: "ASSET_CHANGE_EVENT",
        lines: [
          { accountId: ACCUM, debit: 20_000_000, credit: 0 },
          { accountId: FIXED, debit: 10_000_000, credit: 0 },
          { accountId: SURPLUS, debit: 0, credit: 30_000_000 },
        ],
      },
    ]

    const posted = journalBookValue(input, accounts)

    expect(posted.grossCostPosted.toNumber()).toBe(130_000_000)
    expect(posted.accumulatedPosted.toNumber()).toBe(0)
    expect(posted.bookValue.toNumber()).toBe(130_000_000)
  })

  it("tanpa jurnal peristiwa: angka persis perilaku lama", () => {
    const posted = journalBookValue(journals(), accounts)

    expect(posted.grossCostPosted.toNumber()).toBe(120_000_000)
    expect(posted.accumulatedPosted.toNumber()).toBe(20_000_000)
    expect(posted.bookValue.toNumber()).toBe(100_000_000)
    expect(posted.accumulatedImpairmentPosted.toNumber()).toBe(0)
  })

  it("impairment: kontra Cr mengurangi buku hanya bila akun impairment dipasok", () => {
    const input = [
      ...journals(),
      {
        referenceType: "ASSET_CHANGE_EVENT",
        lines: [
          { accountId: IMPAIR, debit: 0, credit: 15_000_000 },
          { accountId: 60, debit: 15_000_000, credit: 0 },
        ],
      },
    ]

    const withImpair = journalBookValue(input, accounts)
    expect(withImpair.accumulatedImpairmentPosted.toNumber()).toBe(15_000_000)
    expect(withImpair.bookValue.toNumber()).toBe(85_000_000)

    const withoutImpair = journalBookValue(input, {
      fixedAssetAccountId: FIXED,
      accumulatedDepreciationAccountId: ACCUM,
    })
    expect(withoutImpair.accumulatedImpairmentPosted.toNumber()).toBe(0)
    expect(withoutImpair.bookValue.toNumber()).toBe(100_000_000)
  })

  it("revaluasi turun: Cr aset mengurangi bruto", () => {
    const input = [
      ...journals(),
      {
        referenceType: "ASSET_CHANGE_EVENT",
        lines: [
          { accountId: FIXED, debit: 0, credit: 25_000_000 },
          { accountId: SURPLUS, debit: 25_000_000, credit: 0 },
        ],
      },
    ]

    const posted = journalBookValue(input, accounts)
    expect(posted.grossCostPosted.toNumber()).toBe(95_000_000)
    expect(posted.bookValue.toNumber()).toBe(75_000_000)
  })

  it("disposal penuh sesudah revaluasi: buku nol (CASH tidak ikut)", () => {
    const input = [
      ...journals(),
      {
        referenceType: "ASSET_CHANGE_EVENT",
        lines: [
          { accountId: ACCUM, debit: 20_000_000, credit: 0 },
          { accountId: FIXED, debit: 10_000_000, credit: 0 },
          { accountId: SURPLUS, debit: 0, credit: 30_000_000 },
        ],
      },
      {
        referenceType: "ASSET_DISPOSAL",
        lines: [
          { accountId: CASH, debit: 130_000_000, credit: 0 },
          { accountId: FIXED, debit: 0, credit: 130_000_000 },
        ],
      },
    ]

    const posted = journalBookValue(input, accounts)
    expect(posted.bookValue.toNumber()).toBe(0)
  })

  it("menerima Decimal Prisma apa adanya", () => {
    const posted = journalBookValue(
      [
        {
          referenceType: "ASSET_ACQUISITION",
          lines: [{ accountId: FIXED, debit: new Prisma.Decimal(1000), credit: new Prisma.Decimal(0) }],
        },
      ],
      accounts,
    )
    expect(posted.bookValue.toNumber()).toBe(1000)
  })
})
