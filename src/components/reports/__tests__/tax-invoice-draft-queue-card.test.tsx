// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { TaxInvoiceDraftQueueCard } from "../tax-invoice-draft-queue-card"
import {
  buildTaxInvoiceDraftQueue,
  TAX_INVOICE_DRAFT_NOTICE_TEXT,
  TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL,
  TAX_INVOICE_DRAFT_TITLE,
  type TaxInvoiceDraftInput,
} from "@/lib/reports/tax-invoice-draft-queue"
import { formatCurrency } from "@/lib/utils/format"

const NOW = new Date("2026-10-25T22:00:00.000Z") // 2026-10-26 WIB

function input(overrides: Partial<TaxInvoiceDraftInput> = {}): TaxInvoiceDraftInput {
  return {
    taxInvoiceId: 1,
    slug: "fp-1",
    direction: "out",
    djpStatus: "draft",
    transactionCode: "04",
    taxInvoiceNumber: "0400026000000001",
    taxInvoiceDate: new Date("2026-10-24T00:00:00.000Z"),
    taxPeriod: "2026-10",
    dpp: 1_000_000,
    taxRate: 11,
    taxAmount: 110_000,
    counterpartyName: "Lawan Uji",
    creditStatus: null,
    replacesId: null,
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    ...overrides,
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

describe("TaxInvoiceDraftQueueCard F-2026-10-27-098-S", () => {
  it("AC-TIQ-F1/F3: judul/notice/hitungan verbatim; nol kata terlarang; nol tombol; nol tautan", () => {
    const queue = buildTaxInvoiceDraftQueue([input()], NOW)
    const container = render(<TaxInvoiceDraftQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    expect(text).toContain(TAX_INVOICE_DRAFT_TITLE)
    expect(text).toContain(TAX_INVOICE_DRAFT_NOTICE_TEXT)
    expect(text).toContain("1 dokumen")
    expect(text).toContain("Keluaran 1")
    expect(text).toContain("Masukan 0")
    expect(text).toContain("Masa berjalan 2026-10")
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(text).not.toMatch(/terlambat|kewajiban|jatuh tempo/i)
    expect(text).not.toMatch(/Terbit|Ganti|Batal|Kredit PPN|Ekspor|Unggah/)
    expect(text).not.toMatch(/disetujui DJP|terkirim/i)
    expect(JSON.stringify(queue)).not.toContain("xmlPayload")
  })

  it("AC-TIQ-F1: dua ember terpisah; baris verbatim builder (tingkat/umur/masa lampau/pengganti/kredit)", () => {
    const queue = buildTaxInvoiceDraftQueue(
      [
        input(),
        input({
          taxInvoiceId: 2,
          slug: null,
          direction: "in",
          taxInvoiceNumber: "0400026000000002",
          taxPeriod: "2026-09",
          counterpartyName: null,
          creditStatus: "uncredited",
          replacesId: 7,
          createdAt: new Date("2026-10-25T00:00:00.000Z"),
        }),
      ],
      NOW,
    )
    const container = render(<TaxInvoiceDraftQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    const outSection = container.querySelector('section[aria-label="Keluaran"]')
    const inSection = container.querySelector('section[aria-label="Masukan"]')
    expect(outSection).not.toBeNull()
    expect(inSection).not.toBeNull()
    expect(outSection!.textContent).toContain("0400026000000001")
    expect(outSection!.textContent).toContain("Mengendap")
    expect(outSection!.textContent).toContain("6 hari")
    expect(outSection!.textContent).not.toContain("Status Kredit")
    expect(inSection!.textContent).toContain("0400026000000002")
    expect(inSection!.textContent).toContain("Menunggu")
    expect(inSection!.textContent).toContain("1 hari")
    expect(inSection!.textContent).toContain(TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL)
    expect(inSection!.textContent).toContain("uncredited")
    expect(inSection!.textContent).toContain("Pengganti faktur #7")
    expect(inSection!.textContent).toContain("Belum ada lawan tercatat")
    expect(text).toContain(formatCurrency(1_000_000))
    expect(text).toContain(formatCurrency(110_000))
    expect(text).toContain("11%")
  })

  it("kosong: teks kosong jelas, tanpa tabel", () => {
    const queue = buildTaxInvoiceDraftQueue([], NOW)
    const container = render(<TaxInvoiceDraftQueueCard queue={queue} />)

    expect(container.textContent).toContain("Belum ada faktur pajak yang masih draft")
    expect(container.querySelector("table")).toBeNull()
  })

  it("satu ember kosong: teks kosong per ember, ember lain tetap tabel", () => {
    const queue = buildTaxInvoiceDraftQueue([input()], NOW)
    const container = render(<TaxInvoiceDraftQueueCard queue={queue} />)

    expect(container.textContent).toContain("Belum ada faktur pajak masukan yang masih draft")
    expect(container.querySelectorAll("table")).toHaveLength(1)
  })
})
