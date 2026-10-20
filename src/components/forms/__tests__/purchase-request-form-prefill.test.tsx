// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PurchaseRequestForm } from "../purchase-request-form"

function mountInto(node: HTMLElement) {
  const root: Root = createRoot(node)
  return { root, container: node }
}

function unmount(root: Root) {
  act(() => {
    root.unmount()
  })
}

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy(
    {},
    { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) },
  ),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const mockItems = [
  { id: 7, sku: "BRG-7", name: "Plat Baja", unitOfMeasure: "lembar" },
  { id: 9, sku: "BRG-9", name: "Busi", unitOfMeasure: "pcs" },
]
const mockEmployees = [{ id: 1, name: "Staf Gudang" }]

describe("PurchaseRequestForm — prefill stok minimum", () => {
  it("mengisi baris awal dari initialItems dengan qty saran", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <PurchaseRequestForm
          items={mockItems}
          employees={mockEmployees}
          initialItems={[
            { itemId: 7, qty: 5 },
            { itemId: 9, qty: 2 },
          ]}
        />,
      )
    })

    const qtyInputs = container.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="Jumlah baris"]',
    )
    expect(qtyInputs).toHaveLength(2)
    expect(qtyInputs[0].value).toBe("5")
    expect(qtyInputs[1].value).toBe("2")

    unmount(root)
    container.remove()
  })

  it("tanpa initialItems tetap satu baris kosong qty 1", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <PurchaseRequestForm items={mockItems} employees={mockEmployees} />,
      )
    })

    const qtyInputs = container.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="Jumlah baris"]',
    )
    expect(qtyInputs).toHaveLength(1)
    expect(qtyInputs[0].value).toBe("1")

    unmount(root)
    container.remove()
  })
})
