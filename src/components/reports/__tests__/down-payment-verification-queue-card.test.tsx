// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { DownPaymentVerificationQueueCard } from "../down-payment-verification-queue-card"
import {
  buildDownPaymentVerificationQueue,
  DP_QUEUE_NOTICE_TEXT,
  type DownPaymentQueueDpInput,
  type DownPaymentQueueQuotationInput,
} from "@/lib/reports/down-payment-verification-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-25T20:00Z = 2026-10-26 03:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date("2026-10-25T20:00:00.000Z")

function dp(
  partial: Partial<DownPaymentQueueDpInput> & { downPaymentId: number },
): DownPaymentQueueDpInput {
  return {
    documentNo: `DP-${partial.downPaymentId}`,
    quotationId: 1,
    customerId: 7,
    customerName: "CV Uji",
    amount: 10_000_000,
    paymentDate: new Date("2026-10-15T00:00:00.000Z"),
    paymentMethod: "transfer",
    adaBukti: true,
    status: "draft",
    createdAt: new Date("2026-10-23T20:00:00.000Z"), // 24 Okt WIB → umur 2 hari
    ...partial,
  }
}

function quotation(
  partial: Partial<DownPaymentQueueQuotationInput> = {},
): DownPaymentQueueQuotationInput {
  return {
    quotationId: 1,
    quotationDocumentNo: "Q-001",
    quotationStatus: "accepted",
    grandTotal: 100_000_000,
    invoiceThresholdPercent: 50,
    ...partial,
  }
}

function queue() {
  return buildDownPaymentVerificationQueue(
    [
      dp({ downPaymentId: 9, amount: 40_000_000, status: "confirmed" }),
      dp({ downPaymentId: 1, amount: 15_000_000 }),
      dp({ downPaymentId: 2, amount: 5_000_000, adaBukti: false }),
      dp({ downPaymentId: 3, amount: 99_000_000, status: "pending" }),
    ],
    [quotation()],
    { now: NOW },
  )
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("DownPaymentVerificationQueueCard F-2026-10-26-051-S", () => {
  it("baris pending tampil: umur dari createdAt, bukti, jarak, tingkat verbatim builder", () => {
    const q = queue()
    const { container, root } = renderCard(
      <DownPaymentVerificationQueueCard rows={q.rows} summary={q.summary} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    const headers = [
      "Pelanggan",
      "No. Uang Muka",
      "No. Penawaran",
      "Status Penawaran",
      "Tanggal Bayar (klaim)",
      "Menunggu",
      "Jumlah",
      "Bukti",
      "Jarak ke Ambang Invoice",
      "Tingkat",
      "Aksi",
    ]
    headers.forEach((header) => expect(text).toContain(header))
    expect(text).toContain("Antrean Verifikasi Uang Muka")
    expect(text).toContain(DP_QUEUE_NOTICE_TEXT)
    expect(text).toContain("2 uang muka menunggu verifikasi")
    expect(text).toContain("belum menjadi kas")
    // Umur 2 hari dari createdAt (24 Okt WIB), bukan paymentDate 15 Okt.
    expect(text).toContain("2 hari")
    expect(text).not.toContain("11 hari")
    // Penanda bukti dua arah.
    expect(text).toContain("Bukti ada")
    expect(text).toContain("Bukti belum ada")
    expect(text).toContain("Bukti belum ada")
    expect(text).toContain("1")
    // Tingkat + jarak verbatim builder: DP-1 membuka invoice, DP-2 menunggu.
    expect(text).toContain("Konfirmasi Membuka Invoice")
    expect(text).toContain("Menunggu Verifikasi")
    expect(text).toContain("Cukup dengan konfirmasi baris ini")
    // Menunggu lain terpisah, tidak dijumlahkan ke ambang.
    expect(text).toContain("Menunggu lain")
    expect(text).toContain("belum terhitung ambang")
    // Status quotation verbatim server.
    expect(text).toContain("accepted")
    // Ember status lain jujur terhitung (pending warisan), bukan baris.
    expect(text).toContain("Status lain (di luar antrean)")
    expect(text).toContain("1")
    // Urutan header dikunci penuh (geser kolom = asersi ini merah).
    const ths = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent,
    )
    expect(ths).toEqual(headers)
  })

  it("DP confirmed tidak bocor ke antrean; nol tombol mutasi (baca-saja)", () => {
    const q = queue()
    const { container, root } = renderCard(
      <DownPaymentVerificationQueueCard rows={q.rows} summary={q.summary} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    const rowsDom = Array.from(container.querySelectorAll("tbody tr"))
    expect(rowsDom).toHaveLength(2)
    // Sel per kolom dikunci posisi: 5=Menunggu(umur), 7=Bukti, 9=Tingkat.
    expect(rowsDom[0]?.children[5]?.textContent).toBe("2 hari")
    expect(rowsDom[0]?.children[7]?.textContent).toBe("Bukti ada")
    expect(rowsDom[0]?.children[9]?.textContent).toBe("Konfirmasi Membuka Invoice")
    expect(rowsDom[1]?.children[7]?.textContent).toBe("Bukti belum ada")
    expect(rowsDom[1]?.children[9]?.textContent).toBe("Menunggu Verifikasi")
    expect(text).toContain("DP-1")
    expect(text).toContain("DP-2")
    expect(text).not.toContain("DP-9")
    expect(text).not.toContain("DP-3")
    // Baca-saja: nol button; konfirmasi/tolak hanya lewat detail existing.
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(text).not.toContain("Konfirmasi DP")
    // Tautan ke detail DP (jalur konfirmasi existing) + penawaran.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/penjualan/uang-muka/1")
    expect(hrefs).toContain("/penjualan/penawaran/1")
    expect(
      Array.from(container.querySelectorAll("a")).some(
        (a) => a.textContent === "Buka Uang Muka",
      ),
    ).toBe(true)
    // Isi/path bukti tidak pernah tampil.
    expect(text).not.toContain("proofImage")
    expect(container.querySelectorAll("img")).toHaveLength(0)
  })

  it("kosong: teks kosong tampil, nol tombol", () => {
    const q = buildDownPaymentVerificationQueue([], [quotation()], { now: NOW })
    const { container, root } = renderCard(
      <DownPaymentVerificationQueueCard rows={q.rows} summary={q.summary} />,
    )
    roots.push(root)
    expect(container.textContent).toContain(
      "Belum ada uang muka yang menunggu verifikasi",
    )
    expect(container.querySelectorAll("button")).toHaveLength(0)
    // Judul + notice tetap tampil saat kosong (konteks antrean utuh).
    expect(container.textContent).toContain("Antrean Verifikasi Uang Muka")
    expect(container.textContent).toContain(DP_QUEUE_NOTICE_TEXT)
  })
})
