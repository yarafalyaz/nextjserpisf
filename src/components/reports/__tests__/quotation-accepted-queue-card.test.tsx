// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { AcceptedQuotationQueueCard } from "../quotation-accepted-queue-card"
import {
  buildAcceptedQuotationQueue,
  ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT,
  type AcceptedQuotationInput,
} from "@/lib/reports/quotation-accepted-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-25 03:00 UTC = 10:00 WIB; hari WIB = 25 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 25, 3, 0))

function input(over: Partial<AcceptedQuotationInput>): AcceptedQuotationInput {
  return {
    quotationId: 1,
    slug: "penawaran-1",
    documentNo: "Q-0001",
    status: "accepted",
    customerId: 10,
    customerName: "PT Sinar Abadi",
    phone: "0812-3456-7890",
    contactPerson: "Budi",
    salesEmployeeId: 5,
    salesEmployeeName: "Sari Sales",
    customerVehicleLabel: "Toyota Avanza · B 1234 CD",
    date: new Date(Date.UTC(2026, 9, 10)),
    validUntil: new Date(Date.UTC(2026, 9, 30)),
    grandTotal: 1500000,
    acceptedAt: new Date(Date.UTC(2026, 9, 24, 3, 0)),
    salesOrders: [],
    workOrders: [],
    salesInvoices: [],
    downPayments: [],
    ...over,
  }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("AcceptedQuotationQueueCard F-2026-10-25-002-S", () => {
  it("tahap/umur/sisa/fakta DP verbatim server; urutan builder dipertahankan; tanpa label sudah dikonversi (AC-AQ-F1/F2, BR-AQ-09)", () => {
    const rows = buildAcceptedQuotationQueue(
      [
        // MENUNGGU_TINDAK_LANJUT: diterima kemarin, masa berlaku 5 hari lagi.
        input({}),
        // MASA_BERLAKU_LEWAT: validUntil kemarin — tetap tampil paling atas (BR-AQ-06).
        input({
          quotationId: 2,
          slug: null,
          documentNo: "Q-0002",
          validUntil: new Date(Date.UTC(2026, 9, 24)),
          salesEmployeeId: null,
          salesEmployeeName: null,
          customerVehicleLabel: null,
          acceptedAt: new Date(Date.UTC(2026, 9, 20, 3, 0)),
          downPayments: [
            { id: 9, documentNo: "DP-0009", status: "pending", amount: 250000 },
          ],
        }),
        // MENGENDAP: diterima 10 hari lalu, tanpa masa berlaku (TANPA_BATAS).
        input({
          quotationId: 3,
          documentNo: "Q-0003",
          validUntil: null,
          acceptedAt: new Date(Date.UTC(2026, 9, 15, 3, 0)),
          workOrders: [{ id: 7, documentNo: "WO-0007", status: "in_progress" }],
          salesInvoices: [{ id: 8, documentNo: "INV-0008", status: "draft" }],
          downPayments: [
            { id: 10, documentNo: "DP-0010", status: "confirmed", amount: 500000 },
          ],
        }),
        // PERNAH_DIKONVERSI_SO_BATAL: hanya SO cancelled tertaut.
        input({
          quotationId: 4,
          documentNo: "Q-0004",
          acceptedAt: null,
          salesOrders: [{ id: 11, documentNo: "SO-0011", status: "cancelled" }],
        }),
      ],
      NOW,
    )
    const { container, root } = renderCard(
      <AcceptedQuotationQueueCard
        rows={rows}
        canCreateSalesOrder
        canCreateDownPayment
      />,
    )
    roots.push(root)
    const text = container.textContent ?? ""

    for (const header of [
      "Pelanggan",
      "No. Penawaran",
      "Penjual",
      "Kendaraan",
      "Diterima",
      "Umur Terima",
      "Masa Berlaku",
      "Sisa Hari",
      "Nilai",
      "Tahap",
      "Fakta Tertaut",
      "Aksi",
    ]) {
      expect(text).toContain(header)
    }

    // Label tahap verbatim konstanta server (bukan terjemahan UI).
    expect(text).toContain("Masa Berlaku Lewat")
    expect(text).toContain("Mengendap")
    expect(text).toContain("Menunggu Tindak Lanjut")
    expect(text).toContain("Pernah Dikonversi — SO Dibatalkan")
    expect(text).toContain(ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT)

    // Baris masa berlaku lewat tetap tampil (AC-AQ-F2) dan urutan builder
    // dipertahankan apa adanya: lewat dulu, lalu mengendap, menunggu,
    // pernah-dikonversi (BR-AQ-06) — UI tidak mengurut ulang.
    const order = [
      text.indexOf("Q-0002"),
      text.indexOf("Q-0003"),
      text.indexOf("Q-0001"),
      text.indexOf("Q-0004"),
    ]
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))

    // Umur/sisa verbatim builder: angka builder + satuan tampil; umur
    // tidak tercatat tampil label server, bukan 0 hari karangan (EC-5).
    expect(text).toContain("1 hari")
    expect(text).toContain("10 hari")
    expect(text).toContain("tidak tercatat")
    // Umur tidak tercatat tidak dirender sebagai angka hari (label server
    // berdiri sendiri tanpa satuan " hari" sesudahnya).
    expect(text).toContain("—tidak tercatat")

    // Fakta pendamping apa adanya; dilarang label "sudah dikonversi"
    // dari WO/invoice/DP (BR-AQ-09).
    expect(text).toContain("Uang muka: menunggu 1")
    expect(text).toContain("Uang muka: terkonfirmasi 1")
    expect(text).toContain("Order kerja tertaut: WO-0007")
    expect(text).toContain("Faktur tertaut: INV-0008")
    expect(text).toContain("Pesanan penjualan dibatalkan: SO-0011")
    expect(text).not.toContain("Sudah Dikonversi")

    // Aksi hanya tautan existing: detail selalu ada; konversi absen bila
    // sudah ada SO tertaut (Q-0004); uang muka mengikuti izin.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/penjualan/penawaran/penawaran-1")
    expect(hrefs).toContain("/penjualan/penawaran/2")
    expect(hrefs).toContain("/penjualan/pesanan/tambah/penawaran/penawaran-1")
    expect(hrefs).toContain("/penjualan/uang-muka/tambah/penawaran/penawaran-1")
    expect(hrefs).not.toContain("/penjualan/pesanan/tambah/penawaran/penawaran-4")
    // Antrean tidak membuat dokumen sendiri: nol tombol submit/form.
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("tanpa izin buat: tautan konversi dan uang muka hilang, detail tetap ada", () => {
    const rows = buildAcceptedQuotationQueue([input({})], NOW)
    const { container, root } = renderCard(
      <AcceptedQuotationQueueCard
        rows={rows}
        canCreateSalesOrder={false}
        canCreateDownPayment={false}
      />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Buka Penawaran")
    expect(text).not.toContain("Buat Pesanan Penjualan")
    expect(text).not.toContain("Buat Uang Muka")
  })

  it("kosong: teks kosong jujur tampil", () => {
    const { container, root } = renderCard(
      <AcceptedQuotationQueueCard
        rows={[]}
        canCreateSalesOrder
        canCreateDownPayment
      />,
    )
    roots.push(root)
    expect(container.textContent).toContain(
      "Belum ada penawaran diterima yang menunggu tindak lanjut",
    )
  })
})
