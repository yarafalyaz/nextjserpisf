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
  COLLECTION_REMINDER_LEVEL_LABELS,
  COLLECTION_REMINDER_LEVEL_TITLE,
  COLLECTION_REMINDER_NOTICE_TEXT,
  type CollectionFollowUpInput,
  type CollectionInvoiceInput,
} from "@/lib/reports/collection-queue"
import { formatCurrency } from "@/lib/utils/format"

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

function followUp(
  over: Partial<CollectionFollowUpInput>,
): CollectionFollowUpInput {
  return {
    salesInvoiceId: 1,
    followedUpAt: new Date(Date.UTC(2026, 9, 17)),
    outcome: "terhubung_janji_bayar",
    promisedDate: new Date(Date.UTC(2026, 9, 21)),
    deletedAt: null,
    ...over,
  }
}

function clickButton(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  )
  if (!button) throw new Error(`tombol tidak ditemukan: ${text}`)
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("CollectionQueueCard tingkat pengingat F-2026-10-26-050-S", () => {
  function queue050() {
    return buildCollectionQueue(
      [
        invoice({}),
        invoice({
          invoiceId: 2,
          documentNo: "INV-0002",
          dueDate: null,
          customerPhone: null,
          contactPerson: null,
        }),
        invoice({ invoiceId: 3, documentNo: "INV-0003" }),
        invoice({ invoiceId: 4, documentNo: "INV-0004" }),
        invoice({ invoiceId: 5, documentNo: "INV-0005" }),
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
      [
        followUp({ salesInvoiceId: 4 }),
        followUp({ salesInvoiceId: 5 }),
        followUp({
          salesInvoiceId: 5,
          followedUpAt: new Date(Date.UTC(2026, 9, 21)),
          outcome: "tidak_terhubung",
          promisedDate: null,
        }),
      ],
      { now: NOW },
    )
  }

  it("kolom + label tingkat + notice kedua + rekap populasi penuh verbatim builder (AC-COLR-10/11)", () => {
    const queue = queue050()
    expect(
      [...queue.rows]
        .sort((a, b) => a.invoiceId - b.invoiceId)
        .map((r) => r.tingkatPengingat),
    ).toEqual([
      "belum_perlu",
      "tanpa_acuan",
      "pengingat_awal",
      "pengingat_lanjutan",
      "eskalasi",
    ])
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(COLLECTION_REMINDER_LEVEL_TITLE)
    expect(text).toContain(COLLECTION_REMINDER_NOTICE_TEXT)
    // Notice kedua menempel sesudah notice existing.
    expect(text.indexOf(COLLECTION_QUEUE_NOTICE_TEXT)).toBeGreaterThanOrEqual(0)
    expect(text.indexOf(COLLECTION_REMINDER_NOTICE_TEXT)).toBeGreaterThan(
      text.indexOf(COLLECTION_QUEUE_NOTICE_TEXT),
    )
    for (const label of Object.values(COLLECTION_REMINDER_LEVEL_LABELS)) {
      expect(text).toContain(label)
    }
    // Rekap per tingkat atas populasi penuh: hitungan + total sisa builder.
    for (const level of Object.values(queue.summary.reminderLevels)) {
      expect(level.count).toBe(1)
    }
    expect(text).toContain(
      `Tanpa Acuan Tanggal 1 · ${formatCurrency(750_000)}`,
    )
    expect(text).toContain(`Perlu Eskalasi 1 · ${formatCurrency(750_000)}`)
    // Rekap tanpa kontak (AC-COLR-12): nomor telepon tidak ikut rekap/filter.
    expect(container.querySelector('[aria-label="Filter tingkat pengingat"]')).not.toBeNull()
    expect(text).not.toContain("0812-3456-7890 ·")
  })

  it("filter tampil per tingkat: urutan server utuh, rekap tidak berubah, kosong per tingkat jujur (Q-COLR-4)", () => {
    const queue = queue050()
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    const serverOrder = queue.rows.map((r) => r.documentNo)
    const docNos = () =>
      [...container.querySelectorAll("td a")]
        .map((a) => (a.textContent ?? "").trim())
        .filter((t) => t.startsWith("INV-"))
    expect(docNos()).toEqual(serverOrder)

    clickButton(container, "Perlu Eskalasi (1)")
    expect(docNos()).toEqual(["INV-0005"])
    // Rekap populasi penuh tetap tampil saat filter aktif.
    expect(container.textContent).toContain("Semua (5)")
    expect(container.textContent).toContain(
      `Pengingat Awal 1 · ${formatCurrency(750_000)}`,
    )

    clickButton(container, "Semua (5)")
    expect(docNos()).toEqual(serverOrder)

    clickButton(container, "Belum Perlu Diingatkan (1)")
    expect(docNos()).toEqual(["INV-0001"])
  })

  it("filter tingkat tanpa baris: pesan kosong per tingkat, bukan empty state antrean", () => {
    const queue = buildCollectionQueue([invoice({})], [], [], { now: NOW })
    const container = render(
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={false}
        canFollowUp={false}
      />,
    )
    clickButton(container, "Perlu Eskalasi (0)")
    expect(container.textContent).toContain(
      "Tidak ada faktur pada tingkat pengingat ini.",
    )
    expect(container.textContent).not.toContain(
      "Belum ada faktur yang perlu ditagih",
    )
  })
})
