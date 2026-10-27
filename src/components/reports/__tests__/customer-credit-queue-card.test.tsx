// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { CustomerCreditQueueCard } from "../customer-credit-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectNoQueueButtons } from "./draft-queue-card-test-fixtures"
import {
  buildCustomerCreditQueue,
  CUSTOMER_CREDIT_FP_UM_MARKER_LABEL,
  CUSTOMER_CREDIT_QUEUE_AGE_LABEL,
  CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT,
  CUSTOMER_CREDIT_QUEUE_TITLE,
  CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
  type CustomerCreditQueue,
  type CustomerCreditQueueCreditInput,
} from "@/lib/reports/customer-credit-queue"
import {
  creditQueueCredit,
  creditQueueDay,
  creditQueueDp,
} from "@/lib/reports/__tests__/customer-credit-queue-fixtures"

const NOW = new Date("2026-10-26T22:00:00.000Z") // 05:00 WIB, 27 Okt 2026
const day = creditQueueDay(NOW)
const credit = (partial: Partial<CustomerCreditQueueCreditInput> & { creditId: number }) =>
  creditQueueCredit(NOW, partial)
const dp = creditQueueDp

describe("CustomerCreditQueueCard 083-F AC-CCQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-CCQ-F1: verbatim server — judul, label rekap, penanda FP UM, notice; nol label utang/aging; nol tombol", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1 }),
        credit({
          creditId: 2,
          documentNo: "CC-2",
          customerName: "PT Lain",
          sourceType: "RevisionDown",
          sourceId: 200,
          receivedAmount: 5_000_000,
          allocatedAmount: 1_000_000,
          refundedAmount: 500_000,
          createdAt: day(-2),
        }),
      ],
      [dp({ downPaymentId: 100 })],
      new Set([100]),
      { now: NOW },
    )
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(rendered.container.querySelector(`[aria-label="${CUSTOMER_CREDIT_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(headers).toEqual([
      "No. Dokumen",
      "Pelanggan",
      "Sumber",
      "Umur sejak diterbitkan",
      "Diterima",
      "Dialokasikan",
      "Direfund",
      "Saldo",
      "Penanda",
    ])
    expect(CUSTOMER_CREDIT_QUEUE_AGE_LABEL).toBe("sejak diterbitkan")
    expect(headers[3]).toBe("Umur sejak diterbitkan")
    expect(text).toContain(CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT)
    expect(text).toContain(`${CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: Rp 13.500.000 · 2 baris · 1 berpenanda ${CUSTOMER_CREDIT_FP_UM_MARKER_LABEL}`)
    expect(text).toContain("CC-1")
    expect(text).toContain("CC-2")
    expect(text).toContain("CV Uji")
    expect(text).toContain("PT Lain")
    expect(text).toContain("DownPayment")
    expect(text).toContain("RevisionDown")
    expect(text).toContain("10 hari")
    expect(text).toContain("2 hari")
    expect(text).toContain("Rp 10.000.000")
    expect(text).toContain("Rp 5.000.000")
    expect(text).toContain("Rp 1.000.000")
    expect(text).toContain("Rp 500.000")
    expect(text).toContain("Rp 3.500.000")
    expect(text).toContain(CUSTOMER_CREDIT_FP_UM_MARKER_LABEL)
    // Label terlarang 085-V Putusan 1/3 + nol tombol aksi tahap 1.
    for (const banned of ["Utang", "utang", "Aging", "aging", "Saldo buku", "total utang", "Terjurnal", "terjurnal"]) {
      expect(text).not.toContain(banned)
    }
    expectNoQueueButtons(rendered.container)
    expect(rendered.container.querySelector("form")).toBeNull()
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    // Hanya tautan baris DownPayment ke panel kredit per DP existing.
    expect(hrefs).toEqual(["/penjualan/uang-muka/100"])
  })

  it("AC-CCQ-F2: penanda ikut payload apa adanya, bukan simpulan UI — label kustom server tampil; false -> tanpa penanda", () => {
    const customLabel = "PENANDA-SERVER-UJI"
    const queue: CustomerCreditQueue = {
      rows: [
        {
          creditId: 1,
          documentNo: "CC-1",
          customerId: 7,
          customerName: "CV Uji",
          sourceType: "DownPayment",
          sourceId: 100,
          status: "open",
          createdAt: day(-1),
          umurMenungguHari: 99,
          receivedAmount: 1_000_000,
          allocatedAmount: 0,
          refundedAmount: 0,
          saldo: 123_456,
          penandaFpUangMuka: true,
          penandaFpUangMukaLabel: customLabel,
          alokasiTerhalang: false,
        },
        {
          creditId: 2,
          documentNo: "CC-2",
          customerId: 8,
          customerName: "PT Lain",
          sourceType: "DownPayment",
          sourceId: 101,
          status: "open",
          createdAt: day(-1),
          umurMenungguHari: 3,
          receivedAmount: 2_000_000,
          allocatedAmount: 0,
          refundedAmount: 0,
          saldo: 2_000_000,
          penandaFpUangMuka: false,
          penandaFpUangMukaLabel: null,
          alokasiTerhalang: false,
        },
      ],
      summary: { jumlahBaris: 2, totalSaldo: 2_123_456, jumlahPenandaFpUangMuka: 1 },
      anomaly: { openSaldoNol: 0, selesaiSaldoPositif: 0, alokasiMelebihiDiterima: 0 },
    }
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    // Umur/saldo/summary passthrough persis payload (createdAt kemarin != 99).
    expect(text).toContain("99 hari")
    expect(text).toContain("Rp 123.456")
    // Total header = summary.totalSaldo verbatim (2.123.456), BUKAN
    // hitung-ulang UI dari baris (123.456 + 2.000.000 = sama di sini adalah
    // kebetulan payload konsisten builder; mutasi reduce wajib MERAH di
    // tes AC-CCQ-F2b payload tak-konsisten di bawah).
    expect(text).toContain("Rp 2.123.456")
    // Label penanda = penandaFpUangMukaLabel payload verbatim, bukan konstanta UI.
    expect(text).toContain(customLabel)
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom[0]?.textContent).toContain(customLabel)
    expect(rowsDom[1]?.textContent).not.toContain(customLabel)
    expect(rowsDom[1]?.children[8]?.textContent).toBe("—")
    // Penanda bukan baris terkunci: alokasiTerhalang false -> nol kata terkunci/halangan.
    expect(text).not.toContain("Terkunci")
    expect(text).not.toContain("terkunci")
  })

  it("AC-CCQ-F2b: total header passthrough summary tak-konsisten (UI dilarang reduce baris)", () => {
    const queue: CustomerCreditQueue = {
      rows: [
        {
          creditId: 1,
          documentNo: "CC-1",
          customerId: 7,
          customerName: "CV Uji",
          sourceType: "Quotation",
          sourceId: 300,
          status: "open",
          createdAt: day(-1),
          umurMenungguHari: 1,
          receivedAmount: 1_000_000,
          allocatedAmount: 0,
          refundedAmount: 0,
          saldo: 1_000_000,
          penandaFpUangMuka: false,
          penandaFpUangMukaLabel: null,
          alokasiTerhalang: false,
        },
      ],
      // Angka summary sengaja beda dari Σ saldo baris (7.777.777 vs
      // 1.000.000): UI wajib menempel summary server apa adanya.
      summary: { jumlahBaris: 7, totalSaldo: 7_777_777, jumlahPenandaFpUangMuka: 3 },
      anomaly: { openSaldoNol: 0, selesaiSaldoPositif: 0, alokasiMelebihiDiterima: 0 },
    }
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain(
      `${CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: Rp 7.777.777 · 7 baris · 3 berpenanda ${CUSTOMER_CREDIT_FP_UM_MARKER_LABEL}`,
    )
    expect(text).not.toContain("Rp 1.000.000 · 1 baris")
  })

  it("086-B2: baris Quotation/RevisionDown quotation tertahan berpenanda verbatim sama; quotation bebas tanpa penanda", () => {
    // Kontrak 086-B2 (PR #1151): builder menghitung blockedQuotationIds
    // dari residu F4 DP taxed quotation 55 > 0; kartu menempel label.
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 10, sourceType: "Quotation", sourceId: 55 }),
        credit({ creditId: 11, sourceType: "RevisionDown", sourceId: 55 }),
        credit({ creditId: 12, sourceType: "Quotation", sourceId: 56 }),
      ],
      [],
      new Set(),
      { now: NOW },
      [
        {
          quotationId: 55,
          taxedDownPayments: [
            { downPaymentId: 21, documentNo: "DP-2026-021", amount: 11_200_000 },
          ],
          dpAllocations: [],
          dpCredits: [],
        },
      ],
    )
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    const penandaCell = (i: number) => rowsDom[i]?.children[8]?.textContent
    expect(rowsDom).toHaveLength(3)
    // Baris tertahan membawa label server verbatim di sel Penanda.
    expect(penandaCell(0)).toContain(CUSTOMER_CREDIT_FP_UM_MARKER_LABEL)
    expect(penandaCell(1)).toContain(CUSTOMER_CREDIT_FP_UM_MARKER_LABEL)
    // Quotation 56 tanpa fakta tahan -> sel Penanda kosong "—".
    expect(penandaCell(2)).toBe("—")
    // Summary server menghitung baris Quotation/RevisionDown berpenanda.
    expect(text).toContain(
      `${CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: Rp 30.000.000 · 3 baris · 2 berpenanda ${CUSTOMER_CREDIT_FP_UM_MARKER_LABEL}`,
    )
    // Penanda bukan kunci alokasi: nol kata terkunci/halangan.
    expect(text).not.toContain("Terkunci")
    expect(text).not.toContain("terkunci")
  })

  it("086-B2: payload Quotation berpenanda dengan label kustom server tampil verbatim (UI tidak menyimpulkan dari sourceType)", () => {
    const customLabel = "PENANDA-SERVER-UJI"
    const queue: CustomerCreditQueue = {
      rows: [
        {
          creditId: 1,
          documentNo: "CC-1",
          customerId: 7,
          customerName: "CV Uji",
          sourceType: "Quotation",
          sourceId: 55,
          status: "open",
          createdAt: day(-1),
          umurMenungguHari: 1,
          receivedAmount: 1_000_000,
          allocatedAmount: 0,
          refundedAmount: 0,
          saldo: 1_000_000,
          penandaFpUangMuka: true,
          penandaFpUangMukaLabel: customLabel,
          alokasiTerhalang: false,
        },
      ],
      summary: { jumlahBaris: 1, totalSaldo: 1_000_000, jumlahPenandaFpUangMuka: 1 },
      anomaly: { openSaldoNol: 0, selesaiSaldoPositif: 0, alokasiMelebihiDiterima: 0 },
    }
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom[0]?.children[8]?.textContent).toContain(customLabel)
    expect(rowsDom[0]?.textContent).toContain("Quotation")
  })

  it("AC-CCQ-F3: ember anomali tampil terpisah di luar populasi/total", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1 }),
        credit({ creditId: 2, documentNo: "CC-NOL", receivedAmount: 100, allocatedAmount: 100 }),
        credit({ creditId: 3, documentNo: "CC-SELESAI", status: "used", receivedAmount: 100 }),
        credit({ creditId: 4, documentNo: "CC-LEBIH", receivedAmount: 100, allocatedAmount: 150, status: "used", sourceType: "Quotation", sourceId: 300 }),
      ],
      [dp({ downPaymentId: 100 })],
      new Set([100]),
      { now: NOW },
    )
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("Anomali warisan terpisah (tidak masuk populasi/total): open saldo nol: 1 · selesai saldo positif: 1 · alokasi melebihi diterima: 1")
    expect(text).not.toContain("CC-NOL")
    expect(text).not.toContain("CC-SELESAI")
    expect(text).not.toContain("CC-LEBIH")
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(1)
    expect(rowsDom[0]?.textContent).toContain("CC-1")
  })

  it("kosong: teks kosong tampil, tanpa tabel/tombol; rekap nol baris verbatim label server", () => {
    const queue = buildCustomerCreditQueue([], [], new Set(), { now: NOW })
    const rendered = renderCard(<CustomerCreditQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("Tidak ada saldo kredit pelanggan terbuka.")
    expect(text).toContain(`${CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL}: Rp 0 · 0 baris`)
    expect(rendered.container.querySelector("table")).toBeNull()
    expectNoQueueButtons(rendered.container)
    expect(text).not.toContain("Anomali warisan terpisah")
  })
})
