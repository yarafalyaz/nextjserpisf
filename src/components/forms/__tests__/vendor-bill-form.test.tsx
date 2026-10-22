// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { VendorBillForm } from "../vendor-bill-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/purchase.actions", () => ({
  createVendorBill: vi.fn().mockResolvedValue({ success: true }),
  updateVendorBill: vi.fn().mockResolvedValue({ success: true }),
}))

// QuickAddSelect resolves its target via the registry, which statically imports
// server actions (next-auth/next-server). Stub it so this unit test stays pure.
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, {
    get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
  }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

const vendors = [{ id: 1, name: "Pemasok A" }]
const items = [{ id: 7, sku: "SKU-7", name: "Baut M8", cost: 1000, unitOfMeasure: "pcs" }]

describe("vendor-bill-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, Pemasok bintang dekoratif + wajib, opsional bersih", () => {
    const { container, root } = mount(<VendorBillForm vendors={vendors} items={items} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah tagihan pemasok")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(1)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Pemasok *", "PO Terkait", "Jenis PPh"]))
    expect(container.querySelector("#vendorId")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#purchaseOrderId")!.getAttribute("aria-required")).not.toBe("true")
    expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
    act(() => root.unmount())
    container.remove()
  })

  it("ubah: aria-label ubah tagihan pemasok", () => {
    const bill = { id: 9, vendorId: 1, date: "2026-10-22" }
    const { container, root } = mount(<VendorBillForm vendors={vendors} items={items} bill={bill} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir ubah tagihan pemasok")
    expect(form.getAttribute("aria-busy")).toBe("false")
    act(() => root.unmount())
    container.remove()
  })
})
