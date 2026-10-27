// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { BankReconciliationDraftQueueCard } from "../bank-reconciliation-draft-queue-card"
import {
  BANK_RECONCILIATION_DRAFT_COLUMN_LABELS,
  BANK_RECONCILIATION_DRAFT_LEVEL_LABELS,
  BANK_RECONCILIATION_DRAFT_NOTICE_TEXT,
  BANK_RECONCILIATION_DRAFT_STALE_DAYS,
  BANK_RECONCILIATION_DRAFT_TITLE,
  buildBankReconciliationDraftQueue,
  type BankReconciliationDraftInput,
} from "@/lib/reports/bank-reconciliation-draft-queue"
import { formatDate } from "@/lib/utils/format"

// Baca "sekarang" tetap: 2026-10-27 05:00 UTC = 12:00 WIB.
const NOW = new Date("2026-10-27T05:00:00.000Z")
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000)

function input(over: Partial<BankReconciliationDraftInput> = {}): BankReconciliationDraftInput {
  return {
    reconciliationId: 1,
    slug: "rec-1",
    reconciliationNumber: "REC-001",
    status: "draft",
    deletedAt: null,
    accountId: 10,
    accountCode: "110201",
    accountName: "Bank BCA",
    statementDate: day(-2),
    periodStart: null,
    periodEnd: null,
    statementBalance: 1500000,
    bookBalance: 1400000,
    createdAt: day(-1),
    totalItemCount: 0,
    matchingItemCount: 0,
    matchedItemCount: 0,
    adjustmentItemCount: 0,
    ...over,
  }
}

function render(node: React.ReactNode) {
  const { container, root } = renderCard(node)
  roots.push(root)
  return container
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("BankReconciliationDraftQueueCard F-2026-10-27-097-S", () => {
  it("judul/notice/tingkat/kolom verbatim builder; kemajuan hitungan mentah tanpa persen/siap", () => {
    const queue = buildBankReconciliationDraftQueue(
      [
        input({
          reconciliationId: 1,
          createdAt: day(-BANK_RECONCILIATION_DRAFT_STALE_DAYS),
          matchingItemCount: 4,
          matchedItemCount: 1,
        }),
        input({ reconciliationId: 2, slug: "rec-2", createdAt: day(0) }),
      ],
      NOW,
    )
    const container = render(<BankReconciliationDraftQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    expect(BANK_RECONCILIATION_DRAFT_TITLE).toBe("Rekonsiliasi Bank Belum Selesai")
    expect(BANK_RECONCILIATION_DRAFT_NOTICE_TEXT).toContain("masih draft")
    expect(text).toContain("Rekonsiliasi Bank Belum Selesai")
    expect(text).toContain("masih draft")
    expect(text).toContain(BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.mengendap)
    expect(text).toContain(BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.menunggu)
    expect(text).toContain(BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.number)
    expect(text).toContain(BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.progress)
    expect(text).toContain("1 dari 4 tercocok")
    expect(text).toContain(formatDate(day(-2)))
    expect(text).not.toMatch(/%/u)
    expect(text).not.toContain("siap selesai")
    expect(text).not.toContain("status seimbang:")
  })

  it("ambang mengendap dari payload; nol tombol tulis; tautan ke detail existing", () => {
    const queue = buildBankReconciliationDraftQueue(
      [
        input({ reconciliationId: 1, createdAt: day(-BANK_RECONCILIATION_DRAFT_STALE_DAYS) }),
        input({ reconciliationId: 2, slug: "rec-2", createdAt: day(0) }),
      ],
      NOW,
    )
    const container = render(<BankReconciliationDraftQueueCard queue={queue} />)
    const text = container.textContent ?? ""
    const html = container.innerHTML

    expect(text).toContain("Mengendap")
    expect(text).toContain("Menunggu")
    expect(container.querySelector("button")).toBeNull()
    expect(html).not.toMatch(/<button|type="submit"/i)
    expect(html).not.toContain("Cocokkan Sekarang")
    expect(html).not.toContain("Buat Penyesuaian")
    expect(html).not.toContain("Selesaikan Rekonsiliasi")
    expect(container.querySelector('a[href="/keuangan/rekonsiliasi-bank/rec-1"]')).not.toBeNull()
  })

  it("saldo verbatim tanpa difference; antrean kosong jujur", () => {
    const queue = buildBankReconciliationDraftQueue([], NOW)
    expect(queue.rows).toEqual([])
    const container = render(<BankReconciliationDraftQueueCard queue={queue} />)
    const text = container.textContent ?? ""
    const html = container.innerHTML
    expect(text).toContain("Belum ada rekonsiliasi bank yang masih draft")
    expect(html).not.toContain("difference")
    expect(text).not.toContain("status seimbang:")
  })
})
