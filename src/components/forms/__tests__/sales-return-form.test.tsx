// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { SalesReturnForm } from "../sales-return-form"

function mountInto(node: HTMLElement) {
  const root: Root = createRoot(node)
  return { root, container: node }
}

function unmount(root: Root) {
  act(() => {
    root.unmount()
  })
}

// Ensure the useRouter mock doesn't throw
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }
  }
}))

// Mock server actions so the form does not pull next-auth (which needs
// `next/server` and breaks under pure jsdom unit tests).
vi.mock("@/actions/sales.actions", () => ({
  createSalesReturn: vi.fn().mockResolvedValue({ success: true }),
  updateSalesReturn: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

describe("SalesReturnForm", () => {
  const mockInvoices = [{ id: 1, documentNo: "INV-001" }]
  const mockCustomers = [{ id: 10, name: "Customer A" }]
  const mockItems = [{ id: 100, sku: "ITEM-A", name: "Product A" }]

  it("seeds return items from returnData on edit", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm
          invoices={mockInvoices}
          customers={mockCustomers}
          items={mockItems}
          returnData={{
            id: 5,
            salesInvoiceId: 1,
            date: "2026-06-16",
            reason: "Damaged",
            items: [{ itemId: 100, qty: 5 }]
          }}
        />
      )
    })

    const qtyInput = container.querySelector("input[type='number']") as HTMLInputElement
    expect(qtyInput).not.toBeNull()
    expect(qtyInput.value).toBe("5")

    unmount(root)
    container.remove()
  })
})
