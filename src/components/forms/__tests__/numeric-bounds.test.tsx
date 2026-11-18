// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const showErrorMock = vi.fn()
const createTaxMock = vi.fn().mockResolvedValue({ success: true })
const updateTaxMock = vi.fn().mockResolvedValue({ success: true })

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
  showSuccess: vi.fn(),
}))

vi.mock("@/actions/master.actions", () => ({
  createTax: (...args: unknown[]) => createTaxMock(...args),
  updateTax: (...args: unknown[]) => updateTaxMock(...args),
}))

vi.mock("@/actions/hrm.actions", () => ({
  createStatutoryRule: vi.fn().mockResolvedValue({ success: true }),
  closeStatutoryRule: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/actions/inventory.actions", () => ({
  createStockAdjustment: vi.fn().mockResolvedValue({ success: true }),
  updateStockAdjustment: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy(
    {},
    {
      get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
    },
  ),
}))

import CreateTaxPage from "@/app/(dashboard)/master/pajak/tambah/_components/create-tax-client"
import { TaxEditForm } from "@/app/(dashboard)/master/pajak/[slug]/ubah/form"
import { StatutoryRuleForm } from "@/app/(dashboard)/sdm/aturan-statutori/_components/statutory-rule-forms"
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form"

let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("Numeric input bounds (H10)", () => {
  it("CreateTaxPage sets min=0 max=100 on rate and rejects negative/over-100 tax rates", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<CreateTaxPage />)
    })

    const rateInput = container.querySelector('input[name="rate"]') as HTMLInputElement
    expect(rateInput).not.toBeNull()
    expect(rateInput.getAttribute("min")).toBe("0")
    expect(rateInput.getAttribute("max")).toBe("100")

    rateInput.value = "-5"
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Tarif pajak harus antara 0% dan 100%")
    expect(createTaxMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    rateInput.value = "120"
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Tarif pajak harus antara 0% dan 100%")
    expect(createTaxMock).not.toHaveBeenCalled()
  })

  it("TaxEditForm sets min=0 max=100 on rate and rejects out-of-range rate", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<TaxEditForm tax={{ id: 1, name: "PPN", rate: 11 }} />)
    })

    const rateInput = container.querySelector('input[name="rate"]') as HTMLInputElement
    expect(rateInput.getAttribute("min")).toBe("0")
    expect(rateInput.getAttribute("max")).toBe("100")

    rateInput.value = "-1"
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Tarif pajak harus antara 0% dan 100%")
    expect(updateTaxMock).not.toHaveBeenCalled()
  })

  it("StatutoryRuleForm sets min=0 on ruleValue input", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<StatutoryRuleForm canCreate={true} />)
    })

    const valueInput = container.querySelector("#ruleValue") as HTMLInputElement
    expect(valueInput).not.toBeNull()
    expect(valueInput.getAttribute("min")).toBe("0")
  })

  it("StockAdjustmentForm sets min=0 and clamps negative newQty to 0", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(
        <StockAdjustmentForm
          warehouses={[{ id: 1, name: "Gudang Utama" }]}
          items={[{ id: 10, sku: "SKU-1", name: "Filter Oli", qtyOnHand: "10", cost: "50000", trackSerial: false }]}
          adjustment={{
            id: 1,
            warehouseId: 1,
            date: "2026-11-18",
            items: [{ itemId: 10, currentQty: 10, newQty: 8, unitCost: 50000, reason: "opname" }],
          }}
        />,
      )
    })

    const qtyInput = container.querySelector('input[aria-label="Stok baru baris 1"]') as HTMLInputElement
    expect(qtyInput).not.toBeNull()
    expect(qtyInput.getAttribute("min")).toBe("0")

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(qtyInput, "-3")
      qtyInput.dispatchEvent(new Event("input", { bubbles: true }))
      qtyInput.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(Number(qtyInput.value)).toBe(0)
  })
})
