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
  it("tambah: aria-label + aria-busy false, combobox wajib aria-required, 4 bintang dekoratif", () => {
    const { container, root } = mount(<VendorPriceForm vendorOptions={vendorOptions} itemOptions={itemOptions} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah harga pemasok")
    expect(form.getAttribute("aria-busy")).toBe("false")
    const requiredComboboxes = container.querySelectorAll('[role="combobox"][aria-required="true"]')
    expect(requiredComboboxes.length).toBe(2)
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(4)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Pemasok *", "Barang *", "Harga *", "Minimal Jml *"]))
    act(() => root.unmount())
    container.remove()
  })
})
