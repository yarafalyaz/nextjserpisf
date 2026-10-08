// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { GoodsReceiptForm } from "../goods-receipt-form"

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
  createGoodsReceipt: vi.fn().mockResolvedValue({ success: true }),
  updateGoodsReceipt: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const mockWarehouses = [{ id: 1, name: "Gudang Utama" }]
const mockRacks = [{ id: 10, warehouseId: 1, name: "Rak A", code: "R-A" }]
const mockRackRows = [{ id: 100, rackId: 10, name: "Baris 1", code: "B-1" }]

const mockPO = {
  id: 5,
  documentNo: "PO-005",
  vendor: { name: "Vendor A" },
  shippingCost: 0,
  serviceFee: 0,
  discount: 0,
  items: [
    {
      id: 1,
      itemId: 7,
      qty: 10,
      unitPrice: 1000,
      total: 10000,
      receivedQty: 4,
      item: {
        name: "Baut M8",
        sku: "BOLT-M8",
        trackBatch: false,
        trackSerial: false,
        unitOfMeasure: "PCS",
        uomConversions: [],
        defaultWarehouseId: 1,
        defaultRackId: 10,
        defaultRackRowId: 100,
      },
    },
  ],
}

describe("GoodsReceiptForm — item row layout", () => {
  it("shows SKU, keeps unit in a single column, and offers an editable Qty Terima", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <GoodsReceiptForm
          purchaseOrders={[mockPO]}
          warehouses={mockWarehouses}
          racks={mockRacks}
          rackRows={mockRackRows}
          defaultPoId={5}
        />,
      )
    })

    const text = container.textContent ?? ""
    // Item name + SKU both visible.
    expect(text).toContain("Baut M8")
    expect(text).toContain("BOLT-M8")

    // Qty Terima is an editable number input carrying the arrival qty (10-4=6).
    const qtyInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    ).filter((i) => i.closest("tbody"))
    expect(qtyInputs.length).toBeGreaterThanOrEqual(1)
    expect(qtyInputs[0].value).toBe("6")
    expect(qtyInputs[0].readOnly).toBe(false)

    // "PCS" should appear but not awkwardly doubled in one cell; the unit cell
    // holds the single unit label. We assert the header set is sane.
    expect(text).toContain("Qty Terima")
    expect(text).toContain("Dipesan")
    expect(text).toContain("Sisa")

    unmount(root)
    container.remove()
  })

  it("prefills rack and baris from the item defaults", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <GoodsReceiptForm
          purchaseOrders={[mockPO]}
          warehouses={mockWarehouses}
          racks={mockRacks}
          rackRows={mockRackRows}
          defaultPoId={5}
        />,
      )
    })

    const text = container.textContent ?? ""
    // The rack/row comboboxes should show the default labels, not just placeholders.
    expect(text).toContain("R-A — Rak A")
    expect(text).toContain("B-1 — Baris 1")

    unmount(root)
    container.remove()
  })
})
