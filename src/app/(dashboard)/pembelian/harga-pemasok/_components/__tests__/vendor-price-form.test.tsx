// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { VendorPriceForm } from "../vendor-price-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/vendor-price.actions", () => ({
  createVendorPrice: vi.fn().mockResolvedValue({ success: true }),
  updateVendorPrice: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

const vendorOptions = [{ value: "1", label: "Pemasok A" }]
const itemOptions = [{ value: "7", label: "Baut M8" }]

describe("vendor-price-form — a11y wiring", () => {
  function assertA11y(container: HTMLElement, expectedLabel: string) {
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe(expectedLabel)
    expect(form.getAttribute("aria-busy")).toBe("false")
    const requiredComboboxes = container.querySelectorAll('[role="combobox"][aria-required="true"]')
    expect(requiredComboboxes.length).toBe(2)
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(4)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Pemasok *", "Barang *", "Harga *", "Minimal Jml *"]))
  }

  it("tambah: aria-label + aria-busy false, combobox wajib aria-required, 4 bintang dekoratif", () => {
    const { container, root } = mount(<VendorPriceForm vendorOptions={vendorOptions} itemOptions={itemOptions} />)
    assertA11y(container, "Formulir tambah harga pemasok")
    act(() => root.unmount())
    container.remove()
  })

  it("ubah: aria-label ubah + aria-busy false, combobox wajib aria-required, 4 bintang dekoratif", () => {
    const initial = {
      id: 3,
      vendorId: "1",
      itemId: "7",
      price: "12500",
      minQty: "2",
      effectiveDate: "2026-10-22",
      notes: "Catatan edit",
    }
    const { container, root } = mount(
      <VendorPriceForm vendorOptions={vendorOptions} itemOptions={itemOptions} initial={initial} />,
    )
    assertA11y(container, "Formulir ubah harga pemasok")
    act(() => root.unmount())
    container.remove()
  })
})
