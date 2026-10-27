// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { VendorPaymentDraftQueueCard } from "../vendor-payment-draft-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectNoQueueButtons } from "./draft-queue-card-test-fixtures"
import {
  buildVendorPaymentDraftQueue,
  VENDOR_PAYMENT_DRAFT_NOTICE_TEXT,
  VENDOR_PAYMENT_DRAFT_TOTAL_LABEL,
  type VendorPaymentDraftInput,
  type VendorPaymentDraftQueue,
} from "@/lib/reports/vendor-payment-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-25T22:00:00.000Z") // 05:00 WIB, 26 Okt 2026
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<VendorPaymentDraftInput> = {}): VendorPaymentDraftInput {
  return {
    vendorPaymentId: 1,
    slug: "vp-1",
    documentNo: "VP/2026/001",
    status: "draft",
    deletedAt: null,
    vendorId: 10,
    vendorName: "Vendor Uji",
    amount: 1500000,
    paymentDate: day(2),
    vendorBillId: 30,
    vendorBillDocumentNo: "VB/2026/001",
    createdByName: "Pembuat Uji",
    createdAt: day(-5),
    ...over,
  }
}

describe("VendorPaymentDraftQueueCard 072-F AC-VPQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-VPQ-F1: judul/kolom/notice verbatim server + rekap berlabel totalLabel", () => {
    const queue = buildVendorPaymentDraftQueue(
      [
        input({}),
        input({
          vendorPaymentId: 2,
          slug: null,
          documentNo: "VP/2026/002",
          createdAt: day(-1),
          paymentDate: day(-2),
          vendorBillId: null,
          vendorBillDocumentNo: null,
          createdByName: null,
          amount: 500000,
        }),
        // Di luar populasi BR-VPQ-01: tidak pernah tampil.
        input({ vendorPaymentId: 3, documentNo: "VP/2026/003", status: "completed" }),
        input({ vendorPaymentId: 4, documentNo: "VP/2026/004", deletedAt: day(-1) }),
      ],
      NOW,
    )
    const rendered = renderCard(<VendorPaymentDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(
      rendered.container.querySelector('[aria-label="Pembayaran Vendor Draft Mengendap"]'),
    ).not.toBeNull()
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toEqual([
      "Menunggu",
      "No. Dokumen",
      "Vendor",
      "Nilai Draft",
      "Tanggal Bayar",
      "Tagihan Tujuan",
      "Dibuat Oleh",
    ])
    for (const expected of [
      VENDOR_PAYMENT_DRAFT_NOTICE_TEXT,
      "1 mengendap · 1 menunggu konfirmasi · 2 pembayaran draft — Rp 2.000.000 nilai draft belum dibayar",
      "Mengendap: 1",
      "Menunggu Konfirmasi: 1",
      "Vendor Uji: 2 pembayaran draft (1 mengendap, 1 menunggu konfirmasi) — Rp 2.000.000 nilai draft belum dibayar",
      "Mengendap",
      "5 hari",
      "Menunggu Konfirmasi",
      "1 hari",
      "Rp 1.500.000",
      "Rp 500.000",
      "VB/2026/001",
      "Pembuat Uji",
      "Tanggal rencana bayar sudah lewat",
    ]) {
      expect(text).toContain(expected)
    }
    // Label terlarang untuk draft (BR-VPQ-02): bukan kas keluar/terbayar/utang.
    for (const banned of ["Kas Keluar", "Terbayar", "Pengurang Utang", "Tunggakan"]) {
      expect(text).not.toContain(banned)
    }
    expect(text).not.toContain("VP/2026/003")
    expect(text).not.toContain("VP/2026/004")
    // Urutan verbatim builder: mengendap (001) sebelum menunggu (002).
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(2)
    expect(rowsDom[0]?.textContent).toContain("VP/2026/001")
    expect(rowsDom[1]?.textContent).toContain("VP/2026/002")
    // Tagihan/pembuat null tampil persis `—` (BR-VPQ-07/09).
    expect(rowsDom[1]?.children[5]?.textContent).toBe("—")
    expect(rowsDom[1]?.children[6]?.textContent).toBe("—")
    // Tautan hanya ke detail pembayaran existing; slug null → id.
    const links = [...rendered.container.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/pembelian/pembayaran-vendor/vp-1",
      "/pembelian/pembayaran-vendor/2",
    ])
    expectNoQueueButtons(rendered.container)
  })

  it("AC-VPQ-F1: passthrough umur/tingkat/Σ buatan — tampil payload, bukan hitung-ulang", () => {
    const base = input({ createdAt: day(-1) })
    const queue: VendorPaymentDraftQueue = {
      rows: [
        {
          ...base,
          tingkat: "mengendap",
          tingkatLabel: "Mengendap",
          umurDraftHari: 99,
          umurDariMasaDepan: false,
          paymentDateLampau: false,
        },
      ],
      levelCounts: { mengendap: 42, menunggu: 3 },
      vendorCounts: [
        {
          vendorId: 10,
          vendorName: "Vendor Uji",
          levelCounts: { mengendap: 40, menunggu: 2 },
          total: 42,
          totalAmount: 424242,
        },
      ],
      totalDocuments: 45,
      totalAmount: 424242,
      totalLabel: VENDOR_PAYMENT_DRAFT_TOTAL_LABEL,
    }
    const rendered = renderCard(<VendorPaymentDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).toContain("42 mengendap · 3 menunggu konfirmasi · 45 pembayaran draft")
    expect(text).toContain("Rp 424.242 nilai draft belum dibayar")
    expect(text).toContain(
      "Vendor Uji: 42 pembayaran draft (40 mengendap, 2 menunggu konfirmasi) — Rp 424.242 nilai draft belum dibayar",
    )
  })

  it("kosong: teks kosong tampil, nol tombol", () => {
    const queue = buildVendorPaymentDraftQueue([], NOW)
    const rendered = renderCard(<VendorPaymentDraftQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent).toContain("Tidak ada pembayaran vendor draft.")
    expectNoQueueButtons(rendered.container)
  })
})
