// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { ExpenseDraftQueueSection } from "../expense-draft-queue"
import { buildExpenseDraftQueue, type ExpenseDraftInput } from "@/lib/reports/expense-draft-queue"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const NOW = new Date(Date.UTC(2026, 9, 27, 2, 0, 0))
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset, 2, 0, 0))

function input(over: Partial<ExpenseDraftInput> = {}): ExpenseDraftInput {
  return {
    expenseId: 1,
    slug: "exp-0001",
    documentNo: "EXP-0001",
    status: "draft",
    amount: 1_000_000,
    date: day(-1),
    createdAt: day(-1),
    updatedAt: day(-1),
    isReimbursementClaim: false,
    employeeId: null,
    employeeName: null,
    categoryName: "Operasional",
    vendorName: null,
    projectName: null,
    description: "Biaya uji",
    approvals: [],
    ...over,
  }
}

describe("ExpenseDraftQueueSection: nominal bersen", () => {
  it("rekap bucket dan total baris tampil hingga sen", () => {
    const queue = buildExpenseDraftQueue(
      [input({ expenseId: 1, amount: 1_000_000.5 }), input({ expenseId: 2, documentNo: "EXP-0002", slug: "exp-0002", amount: 500_000.25 })],
      NOW,
    )
    const { container, root } = renderCard(<ExpenseDraftQueueSection queue={queue} />)
    const text = container.textContent ?? ""
    expect(text).toContain("1.500.000,75")
    unmountCard(root)
  })
})
