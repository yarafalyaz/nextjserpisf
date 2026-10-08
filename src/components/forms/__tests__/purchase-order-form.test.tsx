// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PurchaseOrderForm } from "../purchase-order-form"

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
    return {
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }
  },
}))

// The PO form imports server actions; those pull next-auth/next-server which
// is unavailable under pure jsdom unit tests.
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseOrder: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseOrder: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const mockVendors = [
  { id: 1, name: "Vendor A", paymentTerm: { name: "NET30", code: "NET30", days: 30 } },
]
const mockItems = [
  { id: 100, sku: "ITEM-A", name: "Product A", cost: "1500", unitOfMeasure: "pcs" },
  { id: 200, sku: "ITEM-B", name: "Product B", cost: "2500", unitOfMeasure: "pcs" },
]

describe("PurchaseOrderForm — Permintaan Pembelian linkage", () => {
  it("shows the linked PR banner and prefills items from the preselected PR", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <PurchaseOrderForm
          vendors={mockVendors}
          items={mockItems}
          defaultPrId={5}
          purchaseRequests={[{ id: 5, documentNo: "PR-005", title: "Bahan Las" }]}
          preselectedPR={{
            id: 5,
            documentNo: "PR-005",
            title: "Bahan Las",
            items: [
              { itemId: 100, qty: 3 },
              { itemId: 200, qty: 2 },
            ],
          }}
        />,
      )
    })

    const text = container.textContent ?? ""
    // Banner references the PR document number and title.
    expect(text).toContain("PR-005")
    expect(text).toContain("Bahan Las")
    // Two item rows seeded from the PR (default is a single empty row).
    expect(container.querySelectorAll("tbody tr").length).toBe(2)

    unmount(root)
    container.remove()
  })

  it("prefills the vendor from the preselected PR", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <PurchaseOrderForm
          vendors={mockVendors}
          items={mockItems}
          defaultPrId={5}
          purchaseRequests={[{ id: 5, documentNo: "PR-005", title: "Bahan Las", vendorId: 1 }]}
          preselectedPR={{
            id: 5,
            documentNo: "PR-005",
            title: "Bahan Las",
            vendorId: 1,
            items: [{ itemId: 100, qty: 3 }],
          }}
        />,
      )
    })

    // The vendor combobox for vendor id 1 must display "Vendor A" (not the placeholder).
    expect(container.textContent).toContain("Vendor A")
    // ...and the vendor's payment term must be prefilled into the term field,
    // locked (read-only) because it comes from the vendor.
    const termInput = container.querySelector<HTMLInputElement>("#paymentTerm")
    expect(termInput?.value).toBe("NET30")
    expect(termInput?.readOnly).toBe(true)
    expect(termInput?.disabled).toBe(true)
    expect(container.textContent).toContain("Otomatis dari vendor")

    unmount(root)
    container.remove()
  })

  it("unlocks the payment term when the operator clicks Ubah", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <PurchaseOrderForm
          vendors={mockVendors}
          items={mockItems}
          defaultPrId={5}
          purchaseRequests={[{ id: 5, documentNo: "PR-005", title: "Bahan Las", vendorId: 1 }]}
          preselectedPR={{
            id: 5,
            documentNo: "PR-005",
            title: "Bahan Las",
            vendorId: 1,
            items: [{ itemId: 100, qty: 3 }],
          }}
        />,
      )
    })

    const termInput = container.querySelector<HTMLInputElement>("#paymentTerm")
    expect(termInput?.readOnly).toBe(true)

    const unlock = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Ubah",
    )
    expect(unlock).toBeTruthy()
    act(() => {
      unlock!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.querySelector<HTMLInputElement>("#paymentTerm")?.readOnly).toBe(false)

    unmount(root)
    container.remove()
  })

  it("does not render the PR section when there are no requests and no link", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(<PurchaseOrderForm vendors={mockVendors} items={mockItems} />)
    })

    expect(container.textContent).not.toContain("Permintaan Pembelian")
    // Falls back to a single blank item row.
    expect(container.querySelectorAll("tbody tr").length).toBe(1)

    unmount(root)
    container.remove()
  })
})
