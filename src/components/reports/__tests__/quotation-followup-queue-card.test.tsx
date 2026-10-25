// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { QuotationFollowUpQueueCard } from "../quotation-followup-queue-card"
import {
  buildQuotationFollowUpQueue,
  filterQuotationFollowUpQueue,
  QUOTATION_FOLLOWUP_NOTICE_TEXT,
  type QuotationFollowUpInput,
} from "@/lib/reports/quotation-followup-queue"

// 2026-10-22 03:00 UTC = 10:00 WIB; hari WIB = 22 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 22, 3, 0))

function input(over: Partial<QuotationFollowUpInput>): QuotationFollowUpInput {
  return {
    quotationId: 1,
    slug: "penawaran-1",
    documentNo: "Q-0001",
    customerId: 10,
    customerName: "PT Sinar Abadi",
    phone: "0812-3456-7890",
    contactPerson: "Budi",
    salesEmployeeId: 5,
    salesEmployeeName: "Sari Sales",
    date: new Date(Date.UTC(2026, 9, 10)),
    validUntil: new Date(Date.UTC(2026, 9, 23)),
    grandTotal: 1500000,
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
  return { container, root }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
})

describe("QuotationFollowUpQueueCard F-2026-10-22-091-S", () => {
  it("kolom + label tahap + notice verbatim §6 dari builder; UI tidak hitung ulang", () => {
    const rows = buildQuotationFollowUpQueue(
      [
        input({}), // MENIPIS, sisa 1
        input({
          quotationId: 2,
          slug: null,
          documentNo: "Q-0002",
          validUntil: new Date(Date.UTC(2026, 9, 20)), // KEDALUWARSA
          phone: null,
          salesEmployeeId: null,
          salesEmployeeName: null,
        }),
        input({
          quotationId: 3,
          documentNo: "Q-0003",
          validUntil: null, // TANPA_BATAS
        }),
        input({
          quotationId: 4,
          documentNo: "Q-0004",
          validUntil: new Date(Date.UTC(2026, 10, 5)), // TERBUKA
        }),
      ],
      NOW,
    )
    const visible = filterQuotationFollowUpQueue(rows)
    const { container, root } = render(
      <QuotationFollowUpQueueCard rows={visible} mode="default" csv="" />,
    )
    roots.push(root)
    const text = container.textContent ?? ""

    for (const header of [
      "Pelanggan",
      "No. Penawaran",
      "Penjual",
      "Terkirim",
      "Masa Berlaku",
      "Sisa Hari",
      "Nilai",
      "Tahap",
      "Aksi",
    ]) {
      expect(text).toContain(header)
    }
    expect(text).toContain("Kedaluwarsa")
    expect(text).toContain("Masa Berlaku Menipis")
    expect(text).toContain("Tanpa Masa Berlaku")
    expect(text).not.toContain("Q-0004") // TERBUKA tersaring default
    expect(text).toContain(QUOTATION_FOLLOWUP_NOTICE_TEXT)
    // Sisa hari + penjual TANPA_BATAS dari builder: `—`, bukan karangan.
    expect(text).toContain("—")
    // Sisa hari baris MENIPIS (Q-0001, validUntil 23 Okt, hari ini 22 Okt)
    // tampil angka builder + satuan dari sel bersama.
    expect(text).toContain("1 hari")
    const detailLinks = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.textContent === "Buka Penawaran",
    )
    expect(detailLinks).toHaveLength(3)
    expect(detailLinks[0]?.getAttribute("href")).toBe("/penjualan/penawaran/2")
    // Tanpa tombol terima/konversi/diskon di antrean.
    expect(text).not.toContain("Terima Penawaran")
    expect(text).not.toContain("Konversi")
    expect(text).not.toContain("Diskon")
    // WA hanya untuk baris ber-phone (Q-0001/Q-0003), Q-0002 tanpa phone.
    const waLinks = Array.from(container.querySelectorAll("a")).filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("https://wa.me/"),
    )
    expect(waLinks).toHaveLength(2)
  })

  it("kosong: teks kosong per mode, ekspor nonaktif", () => {
    const { container, root } = render(
      <QuotationFollowUpQueueCard rows={[]} mode="default" csv="" />,
    )
    roots.push(root)
    expect(container.textContent).toContain("Belum ada penawaran yang perlu dikejar")
    const exportBtn = container.querySelector(
      'button[aria-label="Ekspor antrean penawaran ke CSV"]',
    )
    expect(exportBtn?.hasAttribute("disabled")).toBe(true)
  })
})
