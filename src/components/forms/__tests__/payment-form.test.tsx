// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PaymentForm } from "../payment-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/sales.actions", () => ({
  createSalesPayment: vi.fn().mockResolvedValue({ success: true }),
  updateSalesPayment: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, {
    get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
  }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const invoices = [
  { id: 1, documentNo: "INV-001", grandTotal: "1000000", paidAmount: "0", customer: { name: "PT Uji" } },
]
const accounts = [{ id: 1, code: "1100", name: "Kas" }]

function mount(node: HTMLElement, payment?: { id: number }): Root {
  const root = createRoot(node)
  act(() => {
    root.render(<PaymentForm invoices={invoices} accounts={accounts} payment={payment} />)
  })
  return root
}

function expectDecorativeStars(form: HTMLFormElement, expectedLabels: string[]) {
  const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
  expect(stars.length).toBe(expectedLabels.length)
  const labelTexts = new Set(Array.from(form.querySelectorAll("label"), (l) => l.textContent))
  for (const text of expectedLabels) expect(labelTexts.has(text)).toBe(true)
}

describe("PaymentForm — a11y wiring", () => {
  it("form punya aria-label tambah + aria-busy false; kontrol wajib aria-required/required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah pembayaran penjualan")
    expect(form.getAttribute("aria-busy")).toBe("false")

    for (const id of ["salesInvoiceId", "paymentMethod"]) {
      expect(container.querySelector(`#${id}`)!.getAttribute("aria-required")).toBe("true")
    }
    expect(container.querySelector("#amount")!.getAttribute("required")).not.toBeNull()
    expectDecorativeStars(form, ["Faktur *", "Metode Bayar *", "Jumlah Bayar (Rp) *"])
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah pembayaran penjualan", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, { id: 9 })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pembayaran penjualan")
    act(() => root.unmount())
    container.remove()
  })
})
