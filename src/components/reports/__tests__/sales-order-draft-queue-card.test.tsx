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
    const headers = [
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
    ]
    headers.forEach((header) => expect(text).toContain(header))
    expect(text).toContain("Pesanan Draft Mengendap")
    expect(text).toContain("Mengendap: 1")
    expect(text).toContain("Menunggu Persetujuan: 1")
    expect(text).toContain("2 dokumen")
    expect(text).toContain("nilai draft belum disetujui")
    expect(text).toContain(SALES_ORDER_DRAFT_NOTICE_TEXT)
    // Di luar populasi tidak tampil.
    expect(text).not.toContain("SO-0003")
    expect(text).not.toContain("SO-0004")
    // Urutan verbatim builder: mengendap (SO-0001) sebelum menunggu (SO-0002).
    const rowsDom = Array.from(container.querySelectorAll("tbody tr"))
    expect(rowsDom).toHaveLength(2)
    expect(rowsDom[0]?.textContent).toContain("SO-0001")
    expect(rowsDom[1]?.textContent).toContain("SO-0002")
    // Umur verbatim builder.
    expect(text).toContain("16 hari")
    expect(text).toContain("2 hari")
    // Asal verbatim builder.
    expect(text).toContain("Dari Penawaran Q-0007")
    expect(text).toContain("Langsung")
    // Penjual null tampil persis `—` (fallback karangan = MERAH).
    expect(rowsDom[1]?.children[2]?.textContent).toBe("—")
    expect(rowsDom[0]?.children[2]?.textContent).toBe("Sari Sales")
    // Dengan janji → tanggal janji verbatim builder tampil.
    expect(rowsDom[0]?.children[5]?.textContent).toBe("30 Oktober 2026")
    // Tanpa janji → penanda builder, bukan tanggal karangan.
    expect(rowsDom[1]?.children[5]?.textContent).toBe("Janji kirim belum diisi")
    // Tautan hanya ke detail pesanan existing; slug null → id.
    const detailLinks = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.textContent === "Buka Pesanan",
    )
    expect(detailLinks).toHaveLength(2)
    expect(detailLinks[0]?.getAttribute("href")).toBe("/penjualan/pesanan/pesanan-1")
    expect(detailLinks[1]?.getAttribute("href")).toBe("/penjualan/pesanan/2")
    // Q-SOQ-4 MERAH: nol tombol Setujui/Batal/Kirim (nol button sama sekali).
    expect(container.querySelectorAll("button")).toHaveLength(0)
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
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })
})
