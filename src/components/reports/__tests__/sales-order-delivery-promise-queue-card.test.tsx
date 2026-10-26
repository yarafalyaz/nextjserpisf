// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { SalesOrderDeliveryPromiseQueueCard } from "../sales-order-delivery-promise-queue-card"
import {
  buildSalesOrderDeliveryPromiseQueue,
  SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT,
  type SalesOrderDeliveryPromiseInput,
} from "@/lib/reports/sales-order-delivery-promise-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-26 03:00 UTC = 10:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

function input(
  over: Partial<SalesOrderDeliveryPromiseInput>,
): SalesOrderDeliveryPromiseInput {
  return {
    salesOrderId: 1,
    slug: "so-0001",
    documentNo: "SO-0001",
    status: "confirmed",
    date: new Date(Date.UTC(2026, 9, 20)),
    deliveryDate: new Date(Date.UTC(2026, 9, 26)),
    customerName: "PT Sinar Abadi",
    salesEmployeeName: "Sari Sales",
    lines: [{ orderedQty: 2, deliveredQty: 0, unitPrice: 500000 }],
    ...over,
  }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("SalesOrderDeliveryPromiseQueueCard F-2026-10-25-029-S", () => {
  it("ember/sisa/nilai/totals verbatim builder; urutan builder dipertahankan; penanda tanpa-janji terpisah; baca-saja", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({}),
        input({
          salesOrderId: 2,
          slug: null,
          documentNo: "SO-0002",
          deliveryDate: new Date(Date.UTC(2026, 9, 24)),
          salesEmployeeName: null,
          lines: [{ orderedQty: 3, deliveredQty: 1, unitPrice: 100000 }],
        }),
        input({
          salesOrderId: 3,
          documentNo: "SO-0003",
          deliveryDate: new Date(Date.UTC(2026, 9, 28)),
          lines: [{ orderedQty: 1, deliveredQty: 0, unitPrice: 750000 }],
        }),
      ],
      NOW,
    )
    const { container, root } = renderCard(
      <SalesOrderDeliveryPromiseQueueCard queue={queue} withoutPromiseCount={4} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""

    for (const header of [
      "No. Pesanan",
      "Pelanggan",
      "Penjual",
      "Tanggal",
      "Status",
      "Janji Kirim",
      "Sisa Hari",
      "Baris Sisa",
      "Nilai Sisa",
      "Ember",
      "Aksi",
    ]) {
      expect(text).toContain(header)
    }

    // Label ember verbatim konstanta server.
    expect(text).toContain("Lewat Janji")
    expect(text).toContain("Janji Hari Ini")
    expect(text).toContain("Mendekati Janji")
    expect(text).toContain(SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT)

    // Urutan builder: overdue (SO-0002) -> due_today (SO-0001) -> due_soon (SO-0003).
    const i2 = text.indexOf("SO-0002")
    const i1 = text.indexOf("SO-0001")
    const i3 = text.indexOf("SO-0003")
    expect(i2).toBeGreaterThan(-1)
    expect(i2).toBeLessThan(i1)
    expect(i1).toBeLessThan(i3)

    // Sisa hari verbatim (negatif = lewat); penjual null tampil —.
    expect(text).toContain("-2")
    expect(text).toContain("—")
    // Nilai sisa verbatim builder: SO-0002 = 2 x 100000.
    expect(text).toContain("Rp 200.000")

    // Totals per ember + total verbatim.
    expect(text).toContain("3 pesanan penjualan dalam antrean")
    // Penanda tanpa-janji: angka terpisah, bukan baris.
    expect(text).toContain("4 pesanan penjualan tanpa tanggal janji kirim")

    // Tautan detail SO existing; slug null jatuh ke id.
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/penjualan/pesanan/so-0001")
    expect(hrefs).toContain("/penjualan/pesanan/2")

    // Baca-saja total: nol kontrol interaktif selain tautan.
    expect(container.querySelectorAll("button, input, select, textarea, form"))
      .toHaveLength(0)
  })

  it("antrean kosong: pesan kosong + totals nol verbatim", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue([], NOW)
    const { container, root } = renderCard(
      <SalesOrderDeliveryPromiseQueueCard queue={queue} withoutPromiseCount={0} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(
      "Belum ada pesanan penjualan yang janji kirimnya mendekati atau sudah lewat",
    )
    expect(text).toContain("0 pesanan penjualan dalam antrean")
    expect(container.querySelector("table")).toBeNull()
  })
})
