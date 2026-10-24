// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/actions/invoice-collection.actions", () => ({
  createInvoiceCollectionFollowUp: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { CollectionQueueCard } from "../collection-queue-card"
import {
  buildCollectionQueue,
  COLLECTION_QUEUE_NOTICE_TEXT,
  type CollectionInvoiceInput,
} from "@/lib/reports/collection-queue"

const NOW = new Date(Date.UTC(2026, 9, 22, 3, 0))

function invoice(over: Partial<CollectionInvoiceInput>): CollectionInvoiceInput {
  return {
    invoiceId: 1,
    documentNo: "INV-0001",
    status: "posted",
    deletedAt: null,
    date: new Date(Date.UTC(2026, 9, 1)),
    dueDate: new Date(Date.UTC(2026, 9, 20)),
    grandTotal: 1_000_000,
    paidAmount: 250_000,
    customerId: 10,
    customerName: "PT Sinar Abadi",
    customerPhone: "0812-3456-7890",
    contactPerson: "Budi",
    ...over,
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

describe("CollectionQueueCard F-2026-10-22-089-S", () => {
  it("kolom + label tahap + notice verbatim §6 dari builder; nol hitung UI", () => {
    const queue = buildCollectionQueue(
      [
        invoice({}),
        invoice({
          invoiceId: 2,
          documentNo: "INV-0002",
          dueDate: null,
          customerPhone: null,
          contactPerson: null,
        }),
      ],
      [
        {
          salesInvoiceId: 1,
          exchangeId: 5,
          exchangeDocumentNo: "TF-0001",
          exchangeDate: new Date(Date.UTC(2026, 9, 5)),
          dueDate: new Date(Date.UTC(2026, 9, 25)),
          exchangeDeletedAt: null,
        },
      ],
      [],
      { now: NOW },
    )
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange
        canFollowUp
      />,
    )
    const text = container.textContent ?? ""
    for (const column of [
      "Pelanggan",
      "No. Faktur",
      "Tahap",
      "Jatuh Tempo Acuan",
      "Umur",
      "Nilai Faktur",
      "Dibayar",
      "Sisa",
      "Tindak Lanjut Terakhir",
      "Janji Bayar",
      "Aksi",
    ]) {
      expect(text).toContain(column)
    }
    expect(text).toContain(COLLECTION_QUEUE_NOTICE_TEXT)
    expect(text).toContain("Sudah Diserahkan")
    expect(text).toContain("Belum Diserahkan")
    expect(text).toContain("TF-0001")
    // Baris tanpa due acuan: umur + janji tampil — (AC-COL-5/§6).
    const cells = [...container.querySelectorAll("td")].map(
      (td) => td.textContent,
    )
    expect(cells).toContain("—")
    // Tombol bersyarat: tukar faktur hanya tahap Belum Diserahkan.
    const links = [...container.querySelectorAll("a")].map(
      (a) => a.textContent ?? "",
    )
    expect(links.filter((t) => t.includes("Buat Tukar Faktur"))).toHaveLength(1)
    expect(links.some((t) => t.includes("Hubungi via WhatsApp"))).toBe(true)
    expect(
      [...container.querySelectorAll("button")].some((b) =>
        (b.textContent ?? "").includes("Catat Tindak Lanjut"),
      ),
    ).toBe(true)
  })

  it("tanpa izin: tombol catat + tukar faktur hilang; tanpa phone: WA hilang", () => {
    const queue = buildCollectionQueue(
      [invoice({ customerPhone: null })],
      [],
      [],
      { now: NOW },
    )
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).not.toContain("Buat Tukar Faktur")
    expect(text).not.toContain("Catat Tindak Lanjut")
    expect(text).not.toContain("Hubungi via WhatsApp")
  })

  it("indikator denda terutang F-093-V: hanya dokumen terbit bersaldo tampil", () => {
    const queue = buildCollectionQueue(
      [invoice({}), invoice({ invoiceId: 2, documentNo: "INV-0002" })],
      [],
      [],
      { now: NOW },
      [
        { salesInvoiceId: 1, amount: 100_000, paidAmount: 40_000, status: "posted", reversesId: null },
        { salesInvoiceId: 2, amount: 999_000, paidAmount: 0, status: "paid", reversesId: null },
      ],
    )
    expect(queue.rows[0].hasOutstandingLateFee).toBe(true)
    expect(queue.rows[0].lateFeeOutstanding).toBe(60_000)
    expect(queue.rows[1].hasOutstandingLateFee).toBe(false)
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    expect(container.textContent).toContain("Ada denda terutang")
    expect(container.textContent).not.toContain("Rp 999")
  })

  it("kosong: empty state tampil", () => {
    const queue = buildCollectionQueue([], [], [], { now: NOW })
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    expect(container.textContent).toContain(
      "Belum ada faktur yang perlu ditagih",
    )
  })
})
