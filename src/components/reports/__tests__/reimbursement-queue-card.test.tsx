// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { ReimbursementQueueCard } from "../reimbursement-queue-card"
import {
  buildReimbursementQueue,
  REIMBURSEMENT_QUEUE_NOTICE_TEXT,
  REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL,
  REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL,
  REIMBURSEMENT_QUEUE_TITLE,
  REIMBURSEMENT_QUEUE_TOTAL_LABEL,
  type ReimbursementQueueClaimInput,
} from "@/lib/reports/reimbursement-queue"
import { formatCurrency } from "@/lib/utils/format"

const NOW = new Date("2026-10-25T22:00:00.000Z")

function claim(overrides: Partial<ReimbursementQueueClaimInput> = {}): ReimbursementQueueClaimInput {
  return {
    claimId: 1,
    slug: "klaim-1",
    documentNo: "RB/2026/001",
    employeeId: 10,
    employeeName: "Pengaju Uji",
    amount: 500_000,
    status: "approved",
    hasAccrualJournal: true,
    hasPaymentJournal: false,
    accrualJournalDate: new Date("2026-10-24T00:00:00.000Z"),
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    ...overrides,
  }
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  roots.push(root)
  return container
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
})

describe("ReimbursementQueueCard F-2026-10-27-082-S", () => {
  it("judul/notice/total verbatim builder; nol label utang/aging; nol tombol aksi", () => {
    const queue = buildReimbursementQueue([claim()], NOW)
    const container = render(<ReimbursementQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    expect(text).toContain(REIMBURSEMENT_QUEUE_TITLE)
    expect(text).toContain(REIMBURSEMENT_QUEUE_NOTICE_TEXT)
    expect(text).toContain(REIMBURSEMENT_QUEUE_TOTAL_LABEL)
    expect(text).toContain(formatCurrency(queue.totalStoredAmount))
    expect(text).toContain("1 klaim")
    expect(container.querySelectorAll("button")).toHaveLength(0)
    // Judul kolom/aksi dilarang (AC-RBQ-F2/F3); kata "pembayaran" di judul
    // server sah — yang dilarang label utang/aging di luar notice server.
    expect(text).not.toMatch(/Setujui|Tolak/)
    expect(text).not.toMatch(/Saldo|Saldo Utang|Aging/)
    expect(container.querySelector('[aria-label="Aksi"]')).toBeNull()
  })

  it("baris: tahap/tingkat/umur verbatim + tautan detail klaim existing saja", () => {
    const queue = buildReimbursementQueue(
      [
        claim(),
        claim({
          claimId: 2,
          slug: null,
          documentNo: "RB/2026/002",
          employeeName: null,
          amount: 250_000,
          hasAccrualJournal: false,
          accrualJournalDate: null,
        }),
      ],
      NOW,
    )
    const container = render(<ReimbursementQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    expect(text).toContain("Disetujui")
    expect(text).toContain("Menunggu")
    expect(text).toContain("2 hari")
    expect(text).toContain(REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL)
    expect(text).toContain("Belum ada pengaju tercatat")
    expect(text).toContain(formatCurrency(500_000))
    expect(text).toContain(formatCurrency(250_000))

    const links = [...container.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href")).sort()).toEqual([
      "/keuangan/pengeluaran/2",
      "/keuangan/pengeluaran/klaim-1",
    ])
  })

  it("sub-ember paid-tanpa-jurnal: seksi terpisah terhitung, tahap tetap Disetujui", () => {
    const queue = buildReimbursementQueue(
      [
        claim(),
        claim({
          claimId: 3,
          slug: "klaim-3",
          documentNo: "RB/2026/003",
          status: "paid",
        }),
      ],
      NOW,
    )
    const container = render(<ReimbursementQueueCard queue={queue} />)

    const sub = container.querySelector(
      `section[aria-label="${REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL}"]`,
    )
    expect(sub).not.toBeNull()
    expect(sub!.textContent).toContain("RB/2026/003")
    expect(sub!.textContent).toContain("Disetujui")
    expect(container.textContent).toContain(
      `${REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL} (1)`,
    )
    const mainText = container.textContent ?? ""
    expect(mainText.indexOf("RB/2026/001")).toBeLessThan(
      mainText.indexOf(REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL),
    )
  })

  it("kosong: teks kosong jelas, tanpa tabel", () => {
    const queue = buildReimbursementQueue([], NOW)
    const container = render(<ReimbursementQueueCard queue={queue} />)

    expect(container.textContent).toContain(
      "Belum ada klaim reimbursement disetujui yang menunggu pembayaran",
    )
    expect(container.querySelector("table")).toBeNull()
  })
})
