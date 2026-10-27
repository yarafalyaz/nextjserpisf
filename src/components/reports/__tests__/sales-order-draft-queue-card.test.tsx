// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { SalesOrderDraftQueueCard } from "../sales-order-draft-queue-card"
import {
  buildSalesOrderDraftQueue,
  SALES_ORDER_DRAFT_NOTICE_TEXT,
  type SalesOrderDraftInput,
} from "@/lib/reports/sales-order-draft-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  expectDraftQueueAges,
  expectDraftQueueDateCells,
  expectDraftQueueDetailLinks,
  expectDraftQueueHeaders,
  expectDraftQueueRowOrder,
  expectDraftQueueSellerCells,
  expectDraftQueueSummary,
  expectExcludedDocuments,
  expectNoQueueButtons,
} from "./draft-queue-card-test-fixtures"

// 2026-10-26 03:00 UTC = 10:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

function input(over: Partial<SalesOrderDraftInput>): SalesOrderDraftInput {
  return {
    salesOrderId: 1,
    slug: "pesanan-1",
    documentNo: "SO-0001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Sinar Abadi",
    quotationId: 7,
    quotationDocumentNo: "Q-0007",
    salesEmployeeId: 5,
    salesEmployeeName: "Sari Sales",
    date: new Date(Date.UTC(2026, 9, 10)),
    deliveryDate: new Date(Date.UTC(2026, 9, 30)),
    createdAt: new Date(Date.UTC(2026, 9, 10)), // umur 16 → mengendap
    grandTotal: 1500000,
    ...over,
  }
}

function population(): SalesOrderDraftInput[] {
  return [
    input({
      salesOrderId: 2,
      slug: null,
      documentNo: "SO-0002",
      quotationId: null,
      quotationDocumentNo: null,
      salesEmployeeId: null,
      salesEmployeeName: null,
      deliveryDate: null,
      createdAt: new Date(Date.UTC(2026, 9, 24)), // umur 2 → menunggu
      grandTotal: 500000,
    }),
    input({}), // mengendap, urutan builder lebih dulu walau input belakangan
    // Di luar populasi BR-SOQ-01: tidak pernah tampil.
    input({ salesOrderId: 3, documentNo: "SO-0003", status: "approved" }),
    input({ salesOrderId: 4, documentNo: "SO-0004", deletedAt: new Date(Date.UTC(2026, 9, 20)) }),
  ]
}

function QueueProbe() {
  const queue = buildSalesOrderDraftQueue(population(), NOW)
  return (
    <SalesOrderDraftQueueCard
      rows={queue.rows}
      levelCounts={queue.levelCounts}
      totalDocuments={queue.totalDocuments}
      totalGrandTotal={queue.totalGrandTotal}
    />
  )
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("SalesOrderDraftQueueCard F-2026-10-26-056-S", () => {
  it("kolom + label + notice verbatim builder; urutan payload; nol hitung ulang UI", () => {
    const { container, root } = renderCard(<QueueProbe />)
    roots.push(root)
    const text = container.textContent ?? ""
    expectDraftQueueHeaders(text, [
      "Pelanggan",
      "No. Pesanan",
      "Penjual",
      "Tanggal",
      "Menunggu Persetujuan",
      "Janji Kirim",
      "Asal",
      "Nilai",
      "Tingkat",
      "Aksi",
    ])
    expectDraftQueueSummary(
      text,
      "Pesanan Draft Mengendap",
      "Mengendap: 1",
      "Menunggu Persetujuan: 1",
      "2 dokumen",
      "nilai draft belum disetujui",
      SALES_ORDER_DRAFT_NOTICE_TEXT,
    )
    // Di luar populasi tidak tampil.
    expectExcludedDocuments(text, ["SO-0003", "SO-0004"])
    // Urutan verbatim builder: mengendap (SO-0001) sebelum menunggu (SO-0002).
    const rowsDom = Array.from(container.querySelectorAll("tbody tr"))
    expectDraftQueueRowOrder(rowsDom, "SO-0001", "SO-0002")
    // Umur verbatim builder.
    expectDraftQueueAges(text)
    // Asal verbatim builder.
    expect(text).toContain("Dari Penawaran Q-0007")
    expect(text).toContain("Langsung")
    expectDraftQueueSellerCells(rowsDom)
    // Dengan janji → tanggal janji verbatim builder tampil; tanpa janji → penanda builder.
    expectDraftQueueDateCells(rowsDom, "30 Oktober 2026", "Janji kirim belum diisi")
    // Tautan hanya ke detail pesanan existing; slug null → id.
    expectDraftQueueDetailLinks(
      container,
      "Buka Pesanan",
      "/penjualan/pesanan/pesanan-1",
      "/penjualan/pesanan/2",
    )
    // Q-SOQ-4 MERAH: nol tombol Setujui/Batal/Kirim (nol button sama sekali).
    expectNoQueueButtons(container)
    expect(text).not.toContain("Setujui")
  })

  it("kosong: teks kosong tampil", () => {
    const queue = buildSalesOrderDraftQueue([], NOW)
    const { container, root } = renderCard(
      <SalesOrderDraftQueueCard
        rows={queue.rows}
        levelCounts={queue.levelCounts}
        totalDocuments={queue.totalDocuments}
        totalGrandTotal={queue.totalGrandTotal}
      />,
    )
    roots.push(root)
    expect(container.textContent).toContain("Belum ada pesanan penjualan draft")
    expectNoQueueButtons(container)
  })
})
