// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { ChequeOverdueQueueSection } from "../cheque-overdue-queue"
import { buildChequeOverdueQueue } from "@/lib/reports/cheque-overdue-queue"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("ChequeOverdueQueueSection: nominal bersen", () => {
  it("nominal tercatat ber-sen tampil hingga sen di rekap dan baris", () => {
    const day = (offset: number) => new Date(2026, 9, 27 + offset)
    const queue = buildChequeOverdueQueue(
      [
        {
          chequeId: 1,
          documentNo: "CHQ-0001",
          type: "giro",
          direction: "in",
          number: "G-100",
          party: "Pihak Uji",
          amount: 1_000_000.5,
          dueDate: day(-10),
          status: "pending",
          deletedAt: null,
          createdAt: day(-30),
          updatedAt: day(-30),
        },
      ],
      new Date(2026, 9, 27),
    )
    // sanity: builder menempatkan baris di tier (dipakai sebagai jaminan fixture)
    expect(queue.rows).toHaveLength(1)

    const { container, root } = renderCard(<ChequeOverdueQueueSection queue={queue} />)
    expect(container.textContent ?? "").toContain("1.000.000,50")
    unmountCard(root)
  })
})
