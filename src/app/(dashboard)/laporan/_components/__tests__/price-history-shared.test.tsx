// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { createElement } from "react"
import type { Root } from "react-dom/client"

import {
  PriceHistoryTruncatedKpi,
  PriceHistoryTruncatedNote,
  priceHistorySelects,
} from "../price-history-shared"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

describe("price-history-shared", () => {
  const roots: Root[] = []
  const render = (node: Parameters<typeof renderPageNode>[0]) => {
    const { container, root } = renderPageNode(node)
    roots.push(root)
    return container
  }
  afterEach(() => {
    while (roots.length) unmountCard(roots.pop()!)
  })

  it("selects pelanggan wajib + barang opsional dari pilihan aktif", () => {
    const selects = priceHistorySelects({
      customers: [{ id: 7, code: "C-01", name: "PT Contoh", slug: "pt-contoh" }],
      items: [{ id: 42, name: "Busi Iridium", sku: "BSI-001", slug: null }],
      selectedCustomer: { id: 7, code: "C-01", name: "PT Contoh", slug: "pt-contoh" },
      selectedItem: null,
    } as never)
    expect(selects).toHaveLength(2)
    expect(selects[0]).toMatchObject({ param: "pelanggan", required: true, value: "pt-contoh" })
    expect(selects[0].options).toEqual([{ value: "pt-contoh", label: "C-01 - PT Contoh" }])
    expect(selects[1]).toMatchObject({ param: "barang", value: "" })
    expect(selects[1].options).toEqual([{ value: "42", label: "BSI-001 - Busi Iridium" }])
  })

  it("KPI terpotong verbatim Ada/Tidak ada", () => {
    const ada = render(createElement(PriceHistoryTruncatedKpi, { terpotong: true }))
    expect(ada.querySelector(".report-kpi-label")?.textContent).toBe("Kejadian Terpotong")
    expect(ada.querySelector(".report-kpi-value")?.textContent).toBe("Ada")
    const tidak = render(createElement(PriceHistoryTruncatedKpi, { terpotong: false }))
    expect(tidak.textContent).toContain("Tidak ada")
  })

  it("catatan terpotong verbatim batas per pasangan", () => {
    const node = render(
      createElement(PriceHistoryTruncatedNote, {
        jumlahTampil: 50,
        jumlahTotal: 73,
        maxPerPair: 50,
      }),
    )
    expect(node.textContent).toContain(
      "Menampilkan 50 dari 73 kejadian terbaru (batas 50 kejadian per pasangan).",
    )
  })
})
