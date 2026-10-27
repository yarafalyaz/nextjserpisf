// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { PurchaseOrderDraftQueueCard } from "../purchase-order-draft-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectNoQueueButtons } from "./draft-queue-card-test-fixtures"
import {
  buildPurchaseOrderDraftQueue,
  PURCHASE_ORDER_DRAFT_NOTICE_TEXT,
  PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT,
  PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  type PurchaseOrderDraftInput,
  type PurchaseOrderDraftQueue,
} from "@/lib/reports/purchase-order-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-25T22:00:00.000Z") // 05:00 WIB, 26 Okt 2026
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<PurchaseOrderDraftInput> = {}): PurchaseOrderDraftInput {
  return {
    purchaseOrderId: 1,
    slug: "po-1",
    documentNo: "PO/2026/001",
    status: "draft",
    deletedAt: null,
    vendorId: 10,
    vendorName: "Vendor Uji",
    purchaseRequestId: 20,
    purchaseRequestDocumentNo: "PR/2026/001",
    workOrderId: null,
    workOrderDocumentNo: null,
    isService: false,
    date: day(-5),
    expectedDate: day(3),
    createdByName: "Pembuat Uji",
    createdAt: day(-5),
    grandTotal: 1500000,
    ...over,
  }
}

describe("PurchaseOrderDraftQueueCard 060-F AC-POQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-POQ-F1: judul/kolom/notice verbatim server + rekap berlabel totalLabel", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({}),
        input({
          purchaseOrderId: 2,
          slug: null,
          documentNo: "PO/2026/002",
          vendorName: null,
          purchaseRequestId: null,
          purchaseRequestDocumentNo: null,
          workOrderId: 30,
          workOrderDocumentNo: "WO/2026/001",
          expectedDate: day(-2),
          createdByName: null,
          createdAt: day(-1),
          grandTotal: 500000,
        }),
        // Di luar populasi BR-POQ-01: tidak pernah tampil.
        input({ purchaseOrderId: 3, documentNo: "PO/2026/003", status: "approved" }),
        input({ purchaseOrderId: 4, documentNo: "PO/2026/004", deletedAt: day(-1) }),
      ],
      NOW,
    )
    const rendered = renderCard(<PurchaseOrderDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(
      rendered.container.querySelector('[aria-label="Pesanan Pembelian Draft Mengendap"]'),
    ).not.toBeNull()
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toEqual([
      "Menunggu Persetujuan",
      "No. Dokumen",
      "Vendor",
      "Sumber",
      "Nilai Draft",
      "Rencana Terima",
      "Dibuat Oleh",
    ])
    for (const expected of [
      PURCHASE_ORDER_DRAFT_NOTICE_TEXT,
      "1 mengendap · 1 menunggu persetujuan · 2 pesanan draft — Rp 2.000.000 nilai draft belum disetujui",
      "Mengendap: 1",
      "Menunggu Persetujuan: 1",
      "Mengendap",
      "5 hari",
      "Menunggu Persetujuan",
      "1 hari",
      "Rp 1.500.000",
      "Rp 500.000",
      "Permintaan Pembelian PR/2026/001",
      "Perintah Kerja WO/2026/001",
      "Pembuat Uji",
    ]) {
      expect(text).toContain(expected)
    }
    // Label terlarang untuk draft (BR-POQ-03/04): bukan utang/komitmen/terlambat.
    for (const banned of ["Utang", "Komitmen Bayar", "Terlambat", "Jatuh Tempo"]) {
      expect(text).not.toContain(banned)
    }
    expect(text).not.toContain("PO/2026/003")
    expect(text).not.toContain("PO/2026/004")
    // Urutan verbatim builder: mengendap (001) sebelum menunggu (002).
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(2)
    expect(rowsDom[0]?.textContent).toContain("PO/2026/001")
    expect(rowsDom[1]?.textContent).toContain("PO/2026/002")
    // Vendor/pembuat null tampil persis `—` (EC-POQ-3).
    expect(rowsDom[1]?.children[2]?.textContent).toBe("—")
    expect(rowsDom[1]?.children[6]?.textContent).toBe("—")
    // expectedDate baris 2 lampau: tampil tanggal, TANPA kata terlambat.
    expect(rowsDom[1]?.children[5]?.textContent).not.toBe(PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT)
    // Tautan hanya ke detail pesanan existing; slug null → id.
    const links = [...rendered.container.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/pembelian/pesanan/po-1",
      "/pembelian/pesanan/2",
    ])
    expectNoQueueButtons(rendered.container)
  })

  it("AC-POQ-F1: tanpa expectedDate tampil konstanta server persis", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [input({ expectedDate: null, purchaseRequestId: null, purchaseRequestDocumentNo: null })],
      NOW,
    )
    const rendered = renderCard(<PurchaseOrderDraftQueueCard queue={queue} />)
    root = rendered.root
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(1)
    expect(rowsDom[0]?.children[5]?.textContent).toBe(PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT)
    expect(rowsDom[0]?.children[3]?.textContent).toBe("Langsung")
  })

  it("AC-POQ-F1: passthrough umur/tingkat/Σ buatan — tampil payload, bukan hitung-ulang", () => {
    const base = input({ createdAt: day(-1) })
    const row = buildPurchaseOrderDraftQueue([base], NOW).rows[0]!
    const queue: PurchaseOrderDraftQueue = {
      rows: [{ ...row, tingkat: "mengendap", tingkatLabel: "Mengendap", umurDraftHari: 99 }],
      levelCounts: { mengendap: 42, menunggu: 3 },
      totalDocuments: 45,
      totalGrandTotal: 424242,
      totalLabel: PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT,
    }
    const rendered = renderCard(<PurchaseOrderDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).toContain("42 mengendap · 3 menunggu persetujuan · 45 pesanan draft")
    expect(text).toContain("Rp 424.242 nilai draft belum disetujui")
  })

  it("kosong: teks kosong tampil, nol tombol", () => {
    const queue = buildPurchaseOrderDraftQueue([], NOW)
    const rendered = renderCard(<PurchaseOrderDraftQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent).toContain("Tidak ada pesanan pembelian draft.")
    expectNoQueueButtons(rendered.container)
  })
})
