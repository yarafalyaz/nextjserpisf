// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { QuotationDraftQueueCard } from "../quotation-draft-queue-card"
import {
  buildQuotationDraftQueue,
  countQuotationDraftStages,
  filterQuotationDraftQueue,
  QUOTATION_DRAFT_NOTICE_TEXT,
  type QuotationDraftInput,
} from "@/lib/reports/quotation-draft-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-26 03:00 UTC = 10:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

function input(over: Partial<QuotationDraftInput>): QuotationDraftInput {
  return {
    quotationId: 1,
    slug: "penawaran-1",
    documentNo: "Q-0001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Sinar Abadi",
    salesEmployeeId: 5,
    salesEmployeeName: "Sari Sales",
    date: new Date(Date.UTC(2026, 9, 10)),
    validUntil: new Date(Date.UTC(2026, 9, 27)),
    createdAt: new Date(Date.UTC(2026, 9, 10)),
    grandTotal: 1500000,
    ...over,
  }
}

function population(): QuotationDraftInput[] {
  return [
    input({}), // MENIPIS, sisa 1, umur 16
    input({
      quotationId: 2,
      slug: null,
      documentNo: "Q-0002",
      validUntil: new Date(Date.UTC(2026, 9, 24)), // LEWAT_BELUM_TERKIRIM, sisa -2
      salesEmployeeId: null,
      salesEmployeeName: null,
    }),
    input({ quotationId: 3, documentNo: "Q-0003", validUntil: null }), // TANPA_BATAS
    input({
      quotationId: 4,
      documentNo: "Q-0004",
      validUntil: new Date(Date.UTC(2026, 10, 20)), // TERBUKA
    }),
    // Di luar populasi BR-QD-01: tidak pernah tampil.
    input({ quotationId: 5, documentNo: "Q-0005", status: "sent" }),
    input({ quotationId: 6, documentNo: "Q-0006", deletedAt: new Date(Date.UTC(2026, 9, 20)) }),
  ]
}

function QueueProbe({
  rows,
  total,
  mode = "default",
}: {
  rows: ReturnType<typeof buildQuotationDraftQueue>
  total: number
  mode?: "default" | "semua"
}) {
  return (
    <QuotationDraftQueueCard
      rows={rows}
      stageCounts={countQuotationDraftStages(buildQuotationDraftQueue(population(), NOW))}
      totalDocuments={total}
      mode={mode}
    />
  )
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("QuotationDraftQueueCard F-2026-10-26-055-S", () => {
  it("kolom + label tahap + notice verbatim builder; UI tidak hitung ulang; rekap populasi penuh", () => {
    const rows = buildQuotationDraftQueue(population(), NOW)
    const visible = filterQuotationDraftQueue(rows)
    const { container, root } = renderCard(<QueueProbe rows={visible} total={4} />)
    roots.push(root)
    const text = container.textContent ?? ""
    const headers = [
      "Pelanggan",
      "No. Penawaran",
      "Penjual",
      "Tanggal",
      "Masa Berlaku",
      "Sisa Hari",
      "Umur Draf",
      "Nilai",
      "Tahap",
      "Aksi",
    ]
    headers.forEach((header) => expect(text).toContain(header))
    expect(text).toContain("Draf Penawaran Basi")
    expect(text).toContain("Lewat Masa Berlaku — Belum Terkirim")
    expect(text).toContain("Masa Berlaku Menipis")
    expect(text).toContain("Tanpa Masa Berlaku")
    expect(text).toContain("4 draf penawaran belum terkirim")
    // Rekap = stageCounts populasi penuh, termasuk tahap tersaring default.
    expect(text).toContain("Terbuka: 1")
    expect(text).toContain("Tanpa Masa Berlaku: 1")
    expect(text).not.toContain("Q-0004") // TERBUKA tersaring default
    expect(text).not.toContain("Q-0005")
    expect(text).not.toContain("Q-0006")
    expect(text).toContain(QUOTATION_DRAFT_NOTICE_TEXT)
    // Sisa hari negatif verbatim builder.
    expect(text).toContain("-2 hari")
    // Penjual null tampil persis `—` di selnya (fallback karangan = MERAH):
    // baris LEWAT Q-0002 tanpa penjual; sel sesudah No. Penawaran = penjual.
    const rowsDom = Array.from(container.querySelectorAll("tbody tr"))
    const lewatRow = rowsDom.find((tr) => tr.textContent?.includes("Q-0002"))
    expect(lewatRow?.children[2]?.textContent).toBe("—")
    // Masa berlaku + sisa hari TANPA_BATAS (mode semua di tes lain) juga `—`;
    // di sini baris MENIPIS Q-0001 penjualnya nama builder apa adanya.
    const menipisRow = rowsDom.find((tr) => tr.textContent?.includes("Q-0001"))
    expect(menipisRow?.children[2]?.textContent).toBe("Sari Sales")
    const detailLinks = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.textContent === "Buka Penawaran",
    )
    expect(detailLinks).toHaveLength(2)
    expect(detailLinks[0]?.getAttribute("href")).toBe("/penjualan/penawaran/2")
    // Tanpa tombol aksi massal/kirim/hapus di antrean baca-saja.
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("mode semua: TANPA_BATAS tampil sisa `—` dan umur draf verbatim", () => {
    const rows = buildQuotationDraftQueue(
      [
        input({
          validUntil: null,
          createdAt: new Date(Date.UTC(2026, 9, 1)),
        }),
      ],
      NOW,
    )
    const { container, root } = renderCard(
      <QueueProbe rows={filterQuotationDraftQueue(rows, "semua")} total={1} mode="semua" />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Tanpa Masa Berlaku")
    expect(text).toContain("25 hari") // umur draf fakta builder
  })

  it("kosong: teks kosong per mode", () => {
    const { container, root } = renderCard(<QueueProbe rows={[]} total={0} />)
    roots.push(root)
    expect(container.textContent).toContain(
      "Belum ada draf penawaran yang perlu ditindak",
    )
  })
})
