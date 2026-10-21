// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PriceSourceChip } from "../price-source-chip"

function render(node: HTMLElement, ui: React.ReactNode) {
  const root: Root = createRoot(node)
  act(() => {
    root.render(ui)
  })
  return root
}

describe("PriceSourceChip (BR-TIER-09)", () => {
  it("tingkat: tampil ambang minQty", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <PriceSourceChip priceSource="price_list_tier" priceListMinQty={10} />)
    expect(container.textContent).toContain("Harga tingkat >= 10 — Daftar Harga")
    act(() => root.unmount())
    container.remove()
  })

  it("dasar + master tampil; null dan tingkat-tanpa-minQty senyap", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    let root = render(container, <PriceSourceChip priceSource="price_list_base" priceListMinQty={1} />)
    expect(container.textContent).toContain("Harga daftar")
    act(() => root.unmount())

    root = render(container, <PriceSourceChip priceSource="item_master" />)
    expect(container.textContent).toContain("Harga master")
    act(() => root.unmount())

    root = render(container, <PriceSourceChip priceSource={null} />)
    expect(container.textContent).toBe("")
    act(() => root.unmount())

    root = render(container, <PriceSourceChip priceSource="price_list_tier" priceListMinQty={null} />)
    expect(container.textContent).toBe("")
    act(() => root.unmount())
    container.remove()
  })
})
