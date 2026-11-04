// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { BankStatementDraftQueueSection } from "../bank-statement-draft-queue"
import { buildBankStatementDraftQueue, type BankStatementDraftInput } from "@/lib/reports/bank-statement-draft-queue"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const NOW = new Date("2026-10-27T05:00:00.000Z")
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset, 5, 0, 0))

function input(over: Partial<BankStatementDraftInput> = {}): BankStatementDraftInput {
  return {
    statementId: 1,
    slug: "koran-1",
    status: "draft",
    deletedAt: null,
    accountId: 10,
    accountCode: "110201",
    accountName: "Bank BCA",
    accountNumber: "1234567890",
    date: day(-1),
    reference: "REF-1",
    periodStart: day(-30),
    periodEnd: day(-1),
    openingBalance: 1_000_000,
    closingBalance: 1_500_000,
    totalDebits: 700_000,
    totalCredits: 200_000,
    createdAt: day(-1),
    updatedAt: day(-1),
    uploadedBy: 7,
    uploadedByName: "Staf Keuangan",
    lines: [],
    ...over,
  }
}

describe("BankStatementDraftQueueSection: nominal bersen", () => {
  it("saldo awal/akhir, debit, dan kredit tampil hingga sen", () => {
    const queue = buildBankStatementDraftQueue(
      [
        input({
          openingBalance: 1_000_000.5,
          closingBalance: 1_500_000.75,
          totalDebits: 700_000.25,
          totalCredits: 200_000.5,
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    const { container, root } = renderCard(<BankStatementDraftQueueSection queue={queue} />)
    const text = container.textContent ?? ""
    expect(text).toContain("1.000.000,50")
    expect(text).toContain("1.500.000,75")
    expect(text).toContain("700.000,25")
    expect(text).toContain("200.000,50")
    unmountCard(root)
  })
})
