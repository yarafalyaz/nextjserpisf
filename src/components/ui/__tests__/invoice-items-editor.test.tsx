// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { InvoiceItemsEditor } from "../invoice-items-editor"

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
    }
  }
}))

// Mock server actions
vi.mock("@/actions/sales.actions", () => ({
  updateSalesInvoice: vi.fn().mockResolvedValue({ success: true })
}))

const availableItems = [
  { id: 1, name: "Keyboard", sku: "KBD-01", price: 500000, unitOfMeasure: "pcs", trackSerial: true },
  { id: 2, name: "Mouse", sku: "MOU-01", price: 250000, unitOfMeasure: "pcs", trackSerial: false },
]

describe("InvoiceItemsEditor", () => {
  it("renders non-editable view with correct ARIA semantic table layout", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <InvoiceItemsEditor
          invoiceId={1}
          customerId={10}
          date="2026-06-16"
          taxRate={11}
          discountTotal={0}
          paidAmount={500000}
          editable={false}
          availableItems={availableItems}
          items={[
            { itemId: 1, description: "Keyboard", qty: 2, unitPrice: 500000, discount: 0, total: 1000000 }
          ]}
        />
      )
    })

    // Assert table headers
    const headers = container.querySelectorAll("th")
    expect(headers[0]?.textContent).toBe("Item")
    expect(headers[0]?.getAttribute("scope")).toBe("col") // New ARIA

    // Data rendered
    const cells = container.querySelectorAll("tbody td")
    expect(cells[0]?.textContent).toBe("Keyboard")
    expect(cells[1]?.textContent).toBe("2")
    expect(cells[2]?.textContent).toBe("Rp 500.000") // formatted
    
    // Summary rendered
    expect(container.textContent).toContain("Total Keseluruhan")
    expect(container.textContent).toContain("Terbayar")

    unmount(root)
    container.remove()
  })

  it("renders edit view with proper labels for accessibility", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <InvoiceItemsEditor
          invoiceId={1}
          customerId={10}
          date="2026-06-16"
          taxRate={11}
          discountTotal={0}
          paidAmount={500000}
          editable={true} // Triggers rendering of "Ubah Item" button
          availableItems={availableItems}
          items={[
            { itemId: 1, description: "Keyboard", qty: 2, unitPrice: 500000, discount: 0, total: 1000000 }
          ]}
        />
      )
    })

    // Click "Ubah Item" to go to edit mode
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Ubah Item"))
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    // Verify a11y labels
    const qtyLabel = container.querySelector("label[for='invoice-item-qty-0']")
    expect(qtyLabel).not.toBeNull()
    expect(qtyLabel?.textContent).toBe("Jumlah item baris 1")

    const taxLabel = container.querySelector("label[for='invoice-tax-rate']")
    expect(taxLabel).not.toBeNull()

    const serialLabel = container.querySelector("label[for='invoice-item-serial-0']")
    expect(serialLabel).not.toBeNull()
    
    const removeBtn = container.querySelector("button[aria-label='Hapus item baris 1']")
    expect(removeBtn).not.toBeNull()

    unmount(root)
    container.remove()
  })
})
