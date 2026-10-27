// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import {
  DeliveredUnbilledQueueCard,
  DELIVERED_UNBILLED_TITLE,
} from "../delivered-unbilled-queue-card"
import {
  buildDeliveredUnbilledQueue,
  DELIVERED_UNBILLED_EMPTY_TEXT,
  DELIVERED_UNBILLED_NOTICE_TEXT,
} from "@/lib/reports/delivered-unbilled"
import { FULFILLABLE_ORDER_STATUSES } from "@/lib/reports/order-fulfillment-data"
import { deliveredUnbilledInput as input } from "@/lib/reports/__tests__/delivered-unbilled-fixtures"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// 2026-10-26 03:00 UTC = 10:00 WIB; hari WIB = 26 Okt 2026.
const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("DeliveredUnbilledQueueCard F-2026-10-26-058-S", () => {
  it("angka/totals/urutan verbatim builder; tautan SO slug+fallback id; baca-saja total", () => {
    const queue = buildDeliveredUnbilledQueue(
      [
        input({}),
        input({
          salesOrderId: 2,
          slug: null,
          documentNo: "SO-0002",
          customerName: "CV Bima",
          date: new Date(Date.UTC(2026, 9, 18)),
          lines: [{ lineId: 21, deliveredQty: 10, unitPrice: 100_000 }],
          deliveries: [
            {
              status: "shipped",
              date: new Date(Date.UTC(2026, 9, 10)),
              confirmedAt: new Date(Date.UTC(2026, 9, 10)),
              deliveredAt: null,
              deliveredQty: 10,
            },
          ],
          invoices: [
            {
              salesOrderId: 2,
              status: "posted",
              deletedAt: null,
              grandTotal: 400_000,
            },
          ],
        }),
      ],
      NOW,
      FULFILLABLE_ORDER_STATUSES,
    )
    const { container, root } = renderCard(
      <DeliveredUnbilledQueueCard queue={queue} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""

    expect(container.querySelector(`[aria-label="${DELIVERED_UNBILLED_TITLE}"]`)).not.toBeNull()
    expect(text).toContain(DELIVERED_UNBILLED_NOTICE_TEXT)
    // Totals payload apa adanya (2 SO; terkirim 2jt; terfaktur 400rb; sisa 1,6jt).
    expect(text).toContain("2 pesanan penjualan")
    // Urutan builder: umur tertua dulu (SO-0002, 16 hari) sebelum SO-0001.
    expect(text.indexOf("SO-0002")).toBeLessThan(text.indexOf("SO-0001"))
    expect(text).toContain("16 hari")
    expect(text).toContain("2 hari")
    // Tautan detail SO existing: slug bila ada, id bila slug null (baris SO-0002 slug null -> /2).
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/penjualan/pesanan/2", "/penjualan/pesanan/so-0001"])
    // Baca-saja total: nol kontrol tulis.
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("input")).toBeNull()
  })

  it("payload verbatim: total summary tampil apa adanya walau beda dari sel baris, jumlah baris, dan sisa hitung (nol hitung ulang UI)", () => {
    // Fixture disengaja tidak konsisten: total payload Rp 750.000 beda dari
    // unbilledValue tiap baris (500.000/100.000), dari jumlah baris (600.000),
    // dan dari sisa total terkirim-terfaktur (1.600.000-100.000=1.500.000).
    // Bila UI menghitung ulang berapa pun cara, frasa summary persis di bawah
    // tidak akan muncul -> MERAH. (Temuan low QA 6411111633: fixture lama
    // 1 baris membuat total payload = sel baris, mutasi summary lolos hijau.)
    const queue = {
      rows: [
        {
          salesOrderId: 5,
          slug: null,
          documentNo: "SO-0005",
          customerName: "PT Verbatim",
          date: new Date(Date.UTC(2026, 9, 20)),
          lastDeliveryAt: new Date(Date.UTC(2026, 9, 24)),
          ageDays: 2,
          deliveredValue: 1_000_000,
          billedValue: 100_000,
          unbilledValue: 500_000,
        },
        {
          salesOrderId: 6,
          slug: null,
          documentNo: "SO-0006",
          customerName: "PT Sekunder",
          date: new Date(Date.UTC(2026, 9, 21)),
          lastDeliveryAt: new Date(Date.UTC(2026, 9, 25)),
          ageDays: 1,
          deliveredValue: 700_000,
          billedValue: 0,
          unbilledValue: 100_000,
        },
      ],
      totalDocuments: 2,
      totalDeliveredValue: 1_600_000,
      totalBilledValue: 100_000,
      totalUnbilledValue: 750_000,
    }
    const { container, root } = renderCard(
      <DeliveredUnbilledQueueCard queue={queue} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    // Frasa summary persis (label + total payload), bukan substring angka
    // yang bisa terpuaskan sel baris mana pun.
    expect(text).toContain("Belum Terfaktur Rp 750.000")
    // Sel baris tetap verbatim payload barisnya; total summary bukan salah satunya.
    expect(text).toContain("Rp 500.000")
    expect(text).toContain("Rp 100.000")
    // Hitung-ulang UI mana pun dilarang tampil sebagai summary:
    // jumlah baris (600.000) atau sisa total (1.500.000).
    // "Rp 600.000"/"Rp 1.500.000" boleh ada? Tidak — keduanya unik di
    // fixture ini (bukan sel mana pun), jadi kehadirannya = hitung ulang.
    expect(text).not.toContain("Rp 600.000")
    expect(text).not.toContain("Rp 1.500.000")
    expect(text).not.toContain("Rp 900.000")
  })

  it("kosong: teks kosong verbatim builder, bukan angka karang", () => {
    const queue = buildDeliveredUnbilledQueue([], NOW, FULFILLABLE_ORDER_STATUSES)
    const { container, root } = renderCard(
      <DeliveredUnbilledQueueCard queue={queue} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(DELIVERED_UNBILLED_EMPTY_TEXT)
    expect(text).toContain("0 pesanan penjualan")
    expect(container.querySelector("table")).toBeNull()
  })
})
