// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { SalesInvoiceDraftQueueCard } from "../sales-invoice-draft-queue-card"
import {
  buildSalesInvoiceDraftQueue,
  summarizeSalesInvoiceDraftQueue,
  SALES_INVOICE_DRAFT_LEVEL_LABELS,
  SALES_INVOICE_DRAFT_NOTICE_TEXT,
  type SalesInvoiceDraftInput,
} from "@/lib/reports/sales-invoice-draft-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-25 22:00 UTC = 2026-10-26 05:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date("2026-10-25T22:00:00.000Z")

function input(over: Partial<SalesInvoiceDraftInput>): SalesInvoiceDraftInput {
  return {
    invoiceId: 1,
    slug: "inv-1",
    documentNo: "INV/2026/001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Sinar Abadi",
    salesEmployeeId: 5,
    salesEmployeeName: "Sari Sales",
    salesOrderId: 7,
    salesOrderNo: "SO-0007",
    quotationId: null,
    quotationNo: null,
    projectId: null,
    date: new Date(Date.UTC(2026, 9, 10)),
    dueDate: new Date(Date.UTC(2026, 9, 1)), // lampau — tetap bukan jatuh tempo (BR-SIQ-04)
    createdAt: new Date(Date.UTC(2026, 9, 10)), // umur 16 → mengendap
    grandTotal: 1500000,
    ...over,
  }
}

function population(): SalesInvoiceDraftInput[] {
  return [
    input({
      invoiceId: 2,
      slug: null,
      documentNo: "INV/2026/002",
      salesEmployeeId: null,
      salesEmployeeName: null,
      salesOrderId: null,
      salesOrderNo: null,
      dueDate: null,
      createdAt: new Date(Date.UTC(2026, 9, 24)), // umur 2 → menunggu
      grandTotal: 500000,
    }),
    input({}), // mengendap, urutan builder lebih dulu walau input belakangan
    // Di luar populasi BR-SIQ-01: tidak pernah tampil.
    input({ invoiceId: 3, documentNo: "INV/2026/003", status: "approved" }),
    input({ invoiceId: 4, documentNo: "INV/2026/004", deletedAt: new Date(Date.UTC(2026, 9, 20)) }),
  ]
}

function QueueProbe() {
  const rows = buildSalesInvoiceDraftQueue(population(), NOW)
  return (
    <SalesInvoiceDraftQueueCard
      rows={rows}
      summary={summarizeSalesInvoiceDraftQueue(rows)}
      noticeText={SALES_INVOICE_DRAFT_NOTICE_TEXT}
      levelLabels={SALES_INVOICE_DRAFT_LEVEL_LABELS}
    />
  )
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("SalesInvoiceDraftQueueCard F-2026-10-26-057-S", () => {
  it("kolom + label + notice verbatim builder; urutan payload; nol hitung ulang UI", () => {
    const { container, root } = renderCard(<QueueProbe />)
    roots.push(root)
    const text = container.textContent ?? ""
    const headers = [
      "Pelanggan",
      "No. Faktur",
      "Penjual",
      "Tanggal",
      "Menunggu Posting",
      "Rencana Jatuh Tempo",
      "Sumber",
      "Nilai",
      "Tingkat",
      "Aksi",
    ]
    headers.forEach((header) => expect(text).toContain(header))
    expect(text).toContain("Faktur Draft Mengendap")
    expect(text).toContain("Mengendap: 1")
    expect(text).toContain("Menunggu Posting: 1")
    expect(text).toContain("2 dokumen")
    expect(text).toContain("nilai draft belum terbit")
    expect(text).toContain(SALES_INVOICE_DRAFT_NOTICE_TEXT)
    // Di luar populasi tidak tampil.
    expect(text).not.toContain("INV/2026/003")
    expect(text).not.toContain("INV/2026/004")
    // Urutan verbatim builder: mengendap (001) sebelum menunggu (002).
    const rowsDom = Array.from(container.querySelectorAll("tbody tr"))
    expect(rowsDom).toHaveLength(2)
    expect(rowsDom[0]?.textContent).toContain("INV/2026/001")
    expect(rowsDom[1]?.textContent).toContain("INV/2026/002")
    // Umur verbatim builder.
    expect(text).toContain("16 hari")
    expect(text).toContain("2 hari")
    // Sumber verbatim builder.
    expect(text).toContain("Dari Pesanan SO-0007")
    expect(text).toContain("Langsung")
    // Penjual null tampil persis `—` (fallback karangan = MERAH).
    expect(rowsDom[1]?.children[2]?.textContent).toBe("—")
    expect(rowsDom[0]?.children[2]?.textContent).toBe("Sari Sales")
    // dueDate lampau terisi → tanggal tampil apa adanya, BUKAN label jatuh tempo/piutang.
    expect(rowsDom[0]?.children[5]?.textContent).toBe("1 Oktober 2026")
    expect(text).not.toContain("Lewat Jatuh Tempo")
    expect(text).not.toContain("Jatuh Tempo Terlewat")
    // Tanpa dueDate → penanda builder, bukan tanggal karangan.
    expect(rowsDom[1]?.children[5]?.textContent).toBe("Jatuh tempo belum diisi")
    // Tautan hanya ke detail faktur existing; slug null → id.
    const detailLinks = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.textContent === "Buka Faktur",
    )
    expect(detailLinks).toHaveLength(2)
    expect(detailLinks[0]?.getAttribute("href")).toBe("/penjualan/faktur/inv-1")
    expect(detailLinks[1]?.getAttribute("href")).toBe("/penjualan/faktur/2")
    // Q-SIQ-4 MERAH: nol tombol Posting/Batal/Tagih (nol button sama sekali).
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(text).not.toContain("Batal")
  })

  it("kosong: teks kosong tampil", () => {
    const rows = buildSalesInvoiceDraftQueue([], NOW)
    const { container, root } = renderCard(
      <SalesInvoiceDraftQueueCard
        rows={rows}
        summary={summarizeSalesInvoiceDraftQueue(rows)}
        noticeText={SALES_INVOICE_DRAFT_NOTICE_TEXT}
        levelLabels={SALES_INVOICE_DRAFT_LEVEL_LABELS}
      />,
    )
    roots.push(root)
    expect(container.textContent).toContain("Belum ada faktur penjualan draft")
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })
})
